// Roteiro e2e MANUAL do piolho (Etapas 2 a 4) contra o Sistema de Leads local. Não roda no
// `npm test`: use `npm run e2e` (passo a passo no README, seção "Teste de ponta a ponta").
//
// O que faz: abre o Chromium com a extensão de dist/, serve uma página falsa no lugar de
// web.whatsapp.com com um window.WPP falso (pronto, logado como 556299999999@c.us, com emissor do
// evento chat.new_message), configura o token pelo painel e confere:
// 1. heartbeat 200 (dispositivo com ultimo_sinal_em e numero_detectado);
// 2. 3 mensagens (2 recebidas e 1 enviada) enfileiradas, enviadas, 3 aceitas, fila zerada e no banco
//    1 pessoa, 3 mensagens, 1 evento conversa_iniciada e estágio "Em conversa";
// 3. reenvio das mesmas 3: fila esvazia e o banco não muda;
// 4. "internet caída" (rota do sistema abortada): 2 mensagens ficam na fila com erro `rede` e
//    proximo_envio_em no futuro; liberada a rota, o tick de teste esvazia a fila;
// 5. token inválido: painel mostra "Token inválido" e nada é enviado; token certo: volta a enviar.
//
// Variáveis: PIOLHO_E2E_TOKEN (obrigatória, token de um dispositivo ativo), PIOLHO_SISTEMA_URL
// (padrão http://localhost:3000, a mesma do build), DATABASE_URL (opcional: confere o banco),
// PIOLHO_E2E_CHROMIUM (opcional: executável do Chromium), PIOLHO_E2E_PRINTS (opcional: pasta para
// capturas de tela do painel).
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Sem isto o Playwright não intercepta o fetch do service worker da extensão (heartbeat e lotes),
// e o roteiro não conseguiria contar as chamadas nem "derrubar a internet".
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = join(RAIZ, "dist");
const URL_SISTEMA = (process.env.PIOLHO_SISTEMA_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const TOKEN = process.env.PIOLHO_E2E_TOKEN ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const CHROMIUM = process.env.PIOLHO_E2E_CHROMIUM || undefined;
/** Pasta para capturas de tela do painel (opcional). */
const PRINTS = process.env.PIOLHO_E2E_PRINTS || "";

const MEU_WID = "556299999999@c.us";
const MEU = "5562999999999";
const CONTATO_WID = "556288887777@c.us";
const CONTATO_TEL = "5562988887777";
const SUFIXO = String(Date.now()).slice(-8);

function ok(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function esperar(descricao, fn, timeoutMs = 30_000, intervaloMs = 300) {
  const limite = Date.now() + timeoutMs;
  let ultimo;
  while (Date.now() < limite) {
    try {
      ultimo = await fn();
      if (ultimo) return ultimo;
    } catch (erro) {
      ultimo = erro;
    }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  throw new Error(`FALHOU (tempo esgotado): ${descricao}. Último valor: ${JSON.stringify(ultimo)}`);
}

/** Página falsa do WhatsApp: WPP pronto, logado, com emissor de chat.new_message. */
const PAGINA_WA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>WhatsApp falso</title></head>
<body><p>WhatsApp falso do roteiro e2e do piolho</p>
<script>
  (function () {
    const ouvintes = {};
    const contatos = { "${CONTATO_WID}": { pushname: "Maria E2E", isMyContact: false } };
    window.WPP = {
      isReady: true,
      loader: { onReady: function () {} },
      conn: {
        isAuthenticated: function () { return true; },
        isMainReady: function () { return true; },
        getMyUserId: function () { return { _serialized: "${MEU_WID}" }; },
      },
      contact: {
        get: async function (id) { return contatos[id]; },
        getPnLidEntry: async function () { return undefined; },
      },
      on: function (ev, cb) { (ouvintes[ev] = ouvintes[ev] || []).push(cb); },
      off: function (ev, cb) { ouvintes[ev] = (ouvintes[ev] || []).filter(function (f) { return f !== cb; }); },
    };
    window.__piolhoOuvintes = function () { return (ouvintes["chat.new_message"] || []).length; };
    window.__piolhoEmitir = function (msgs) {
      msgs.forEach(function (m) {
        const fromMe = m.fromMe;
        const remoto = { _serialized: m.chat };
        const eu = { _serialized: "${MEU_WID}" };
        const msg = {
          id: { _serialized: fromMe + "_" + m.chat + "_" + m.id, fromMe: fromMe },
          from: fromMe ? eu : remoto,
          to: fromMe ? remoto : eu,
          t: m.t,
          type: m.type || "chat",
          body: m.body,
          notifyName: fromMe ? "" : "Maria E2E",
          isNewMsg: true,
        };
        (ouvintes["chat.new_message"] || []).forEach(function (cb) { cb(msg); });
      });
    };
  })();
</script></body></html>`;

async function main() {
  ok(TOKEN.startsWith("pio_"), "PIOLHO_E2E_TOKEN definido");
  const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
  const hostSistema = `${new URL(URL_SISTEMA).protocol}//${new URL(URL_SISTEMA).hostname}/*`;
  ok(
    manifest.host_permissions.includes(hostSistema),
    `dist/ gerado com PIOLHO_SISTEMA_URL (host_permissions tem ${hostSistema})`,
  );

  // Aquece as rotas do dev server (a primeira compilação do Next pode passar dos 20 s do cliente).
  for (const rota of ["/api/ingest/heartbeat", "/api/ingest/whatsapp"]) {
    const r = await fetch(`${URL_SISTEMA}${rota}`, { method: "POST", body: "{}" });
    ok(r.status === 401, `rota ${rota} no ar (401 sem token)`);
  }

  let db = null;
  if (DATABASE_URL) {
    const pg = (await import("pg")).default;
    db = new pg.Client({ connectionString: DATABASE_URL });
    await db.connect();
  } else {
    console.log("aviso - DATABASE_URL ausente: conferências no banco puladas");
  }
  const consultar = async (sql, params = []) => (await db.query(sql, params)).rows;
  const hashToken = createHash("sha256").update(TOKEN, "utf8").digest("hex");

  const perfil = mkdtempSync(join(tmpdir(), "piolho-e2e-"));
  const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: CHROMIUM,
    headless: true,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });

  // Rede: WhatsApp falso; sistema liberado ou "derrubado"; o resto bloqueado.
  let sistemaFora = false;
  const chamadasSistema = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith("https://web.whatsapp.com/")) {
      return route.fulfill({ status: 200, contentType: "text/html", body: PAGINA_WA });
    }
    if (url.startsWith(URL_SISTEMA)) {
      const caminho = new URL(url).pathname;
      if (sistemaFora) {
        chamadasSistema.push({ caminho, status: "abortada" });
        return route.abort("internetdisconnected");
      }
      const resposta = await route.fetch();
      chamadasSistema.push({ caminho, status: resposta.status() });
      return route.fulfill({ response: resposta });
    }
    if (url.startsWith("chrome-extension://") || url.startsWith("data:")) return route.continue();
    return route.abort();
  });

  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15_000 });
    const idExtensao = new URL(sw.url()).host;

    const painel = await ctx.newPage();
    const errosPainel = [];
    painel.on("pageerror", (e) => errosPainel.push(e.message));
    await painel.goto(`chrome-extension://${idExtensao}/src/sidepanel/index.html`);
    await painel.waitForSelector('[data-testid="banner-status"]');

    let n = 0;
    const status = async () => {
      const r = await painel.evaluate(
        (requestId) =>
          chrome.runtime.sendMessage({ ns: "__PIOLHO__", origem: "painel", requestId, tipo: "obter_estado", payload: null }),
        `e2e${++n}`,
      );
      return r.status;
    };
    const tickTeste = () =>
      painel.evaluate(
        (requestId) =>
          chrome.runtime.sendMessage({ ns: "__PIOLHO__", origem: "painel", requestId, tipo: "tick_teste", payload: null }),
        `e2e${++n}`,
      );
    const print = async (nome) => {
      if (PRINTS) await painel.screenshot({ path: join(PRINTS, `piolho-${nome}.png`), fullPage: true });
    };
    const texto = async (testid) => (await painel.textContent(`[data-testid="${testid}"]`))?.trim();

    const wa = await ctx.newPage();
    await wa.goto("https://web.whatsapp.com/");
    await painel.bringToFront();
    await esperar("banner conectado", async () =>
      (await painel.getAttribute('[data-testid="banner-status"]', "data-situacao")) === "conectado",
    );
    ok((await texto("numero-detectado"))?.includes("+55 (62) 99999-9999"), "número próprio detectado no painel");
    await esperar("escuta de chat.new_message registrada", () => wa.evaluate(() => window.__piolhoOuvintes() > 0));
    ok(true, "MAIN world registrou WPP.on('chat.new_message')");

    // ---- Etapa 2: configuração e heartbeat ----
    await painel.fill('[data-testid="campo-token"]', TOKEN);
    await painel.click('button[type="submit"]');
    await esperar("heartbeat aceito", async () => (await status()).ultimo_heartbeat_em !== null);
    const hb = chamadasSistema.find((c) => c.caminho === "/api/ingest/heartbeat");
    ok(hb?.status === 200, `heartbeat respondeu ${hb?.status}`);
    await esperar("painel com último heartbeat", async () => (await texto("ultimo-heartbeat")) !== "nunca");
    ok(true, `painel: Último heartbeat "${await texto("ultimo-heartbeat")}", Servidor "${await texto("sync-servidor")}"`);
    if (db) {
      const [d] = await consultar("select numero_detectado, ultimo_sinal_em, versao_extensao from dispositivos where token_hash = $1", [hashToken]);
      ok(d?.numero_detectado === MEU && d.ultimo_sinal_em !== null, `dispositivo: numero_detectado=${d?.numero_detectado}, ultimo_sinal_em preenchido`);
    }

    // ---- Etapas 3 e 4: escuta ao vivo, fila e envio ----
    const agora = Math.floor(Date.now() / 1000);
    const tres = [
      { id: `E2E${SUFIXO}A`, chat: CONTATO_WID, fromMe: false, t: agora - 180, body: "Olá! Quero saber do Gestão na Veia" },
      { id: `E2E${SUFIXO}B`, chat: CONTATO_WID, fromMe: false, t: agora - 120, body: "Olá! Quero saber do Gestão na Veia" },
      { id: `E2E${SUFIXO}C`, chat: CONTATO_WID, fromMe: true, t: agora - 60, body: "Oi, Maria! Já te explico." },
    ];
    const idsTres = tres.map((m) => `${m.fromMe}_${m.chat}_${m.id}`);
    const antesIngest = chamadasSistema.filter((c) => c.caminho === "/api/ingest/whatsapp").length;
    await wa.evaluate((msgs) => window.__piolhoEmitir(msgs), tres);
    // Também um grupo e um status: devem ser ignorados.
    await wa.evaluate(
      (t) =>
        window.__piolhoEmitir([
          { id: "GRUPO1", chat: "120363012345678901@g.us", fromMe: false, t },
          { id: "STATUS1", chat: "status@broadcast", fromMe: false, t },
        ]),
      agora,
    );
    const s1 = await esperar("3 aceitos e fila zerada", async () => {
      const s = await status();
      return s.ultimo_envio?.aceitos === 3 && s.pendentes === 0 ? s : null;
    });
    const ingest = chamadasSistema.filter((c) => c.caminho === "/api/ingest/whatsapp").slice(antesIngest);
    ok(ingest.length === 1 && ingest[0].status === 200, `1 lote enviado com status ${ingest.map((c) => c.status).join(",")}`);
    ok(s1.pendentes === 0 && s1.ultimo_envio.aceitos === 3, "resposta com 3 aceitos e fila zerada");
    ok(s1.checkpoint === new Date((agora - 60) * 1000).toISOString(), `checkpoint avançou para ${s1.checkpoint}`);

    const contarBanco = async () => {
      const pessoas = await consultar(
        "select distinct p.id, e.nome as estagio from identificadores i join pessoas p on p.id = i.pessoa_id left join estagios e on e.id = p.estagio_id where i.tipo = 'telefone' and i.valor = $1",
        [CONTATO_TEL],
      );
      const [{ c: mensagens }] = await consultar("select count(*)::int c from mensagens where numero_monitorado = $1 and chat_id = $2", [MEU, CONTATO_WID]);
      const [{ c: conversas }] = await consultar(
        "select count(*)::int c from eventos where tipo = 'conversa_iniciada' and pessoa_id = any($1::uuid[])",
        [pessoas.map((p) => p.id)],
      );
      return { pessoas: pessoas.length, estagio: pessoas[0]?.estagio ?? null, mensagens, conversas };
    };
    let banco1 = null;
    if (db) {
      banco1 = await contarBanco();
      ok(banco1.pessoas === 1, `banco: 1 pessoa (${banco1.pessoas})`);
      ok(banco1.mensagens === 3, `banco: 3 mensagens (${banco1.mensagens})`);
      ok(banco1.conversas === 1, `banco: 1 evento conversa_iniciada (${banco1.conversas})`);
      ok(banco1.estagio === "Em conversa", `banco: estágio "${banco1.estagio}"`);
      const [{ c }] = await consultar("select count(*)::int c from mensagens where wa_msg_id = any($1::text[])", [idsTres]);
      ok(c === 3, "banco: os 3 wa_msg_id gravados");
    }

    // Reenvio das mesmas 3: entram de novo na fila (já tinham saído), vão e voltam aceitas.
    const envioAnterior = s1.ultimo_envio.quando;
    await wa.evaluate((msgs) => window.__piolhoEmitir(msgs), tres);
    const s2 = await esperar("reenvio aceito", async () => {
      const s = await status();
      return s.ultimo_envio?.quando !== envioAnterior && s.pendentes === 0 ? s : null;
    });
    ok(s2.ultimo_envio.aceitos === 3, "reenvio: 3 aceitos (duplicado conta como aceito)");
    if (db) {
      const banco2 = await contarBanco();
      ok(JSON.stringify(banco2) === JSON.stringify(banco1), `reenvio: banco não mudou ${JSON.stringify(banco2)}`);
    }

    // ---- "Derrubar a internet" ----
    sistemaFora = true;
    const duas = [
      { id: `E2E${SUFIXO}D`, chat: CONTATO_WID, fromMe: false, t: agora - 30, body: "Ainda está aí?" },
      { id: `E2E${SUFIXO}E`, chat: CONTATO_WID, fromMe: true, t: agora - 20, body: "Sim!" },
    ];
    await wa.evaluate((msgs) => window.__piolhoEmitir(msgs), duas);
    const s3 = await esperar("erro de rede com 2 na fila", async () => {
      const s = await status();
      return s.pendentes === 2 && s.ultimo_erro?.tipo === "rede" ? s : null;
    });
    ok(Date.parse(s3.proximo_envio_em) > Date.now(), `offline: 2 na fila, proximo_envio_em no futuro (${s3.proximo_envio_em})`);
    await esperar("painel com erro rede", async () =>
      (await painel.getAttribute('[data-testid="ultimo-erro"]', "data-tipo")) === "rede",
    );
    await print("offline");
    ok((await texto("fila-pendente")) === "2", `painel: fila pendente 2, erro "${await texto("ultimo-erro")}"`);
    // Durante o backoff, o tick normal não envia: a fila continua com 2.
    sistemaFora = false;
    const abortadas = chamadasSistema.filter((c) => c.status === "abortada").length;
    ok(abortadas >= 1, `${abortadas} chamada(s) abortada(s) enquanto o sistema estava fora`);
    await tickTeste();
    const s4 = await esperar("fila esvaziada depois de voltar", async () => {
      const s = await status();
      return s.pendentes === 0 ? s : null;
    });
    ok(s4.ultimo_erro === null && s4.proximo_envio_em === null, "online de novo: fila zerada, erro e backoff limpos");
    if (db) {
      const banco3 = await contarBanco();
      ok(banco3.mensagens === 5, `banco: 5 mensagens depois da volta (${banco3.mensagens})`);
    }

    // ---- Token inválido ----
    await painel.fill('[data-testid="campo-token"]', `pio_${"x".repeat(43)}`);
    await painel.click('button[type="submit"]');
    await esperar("token inválido no painel", async () => (await painel.$('[data-testid="token-invalido"]')) !== null);
    await print("token-invalido");
    ok((await status()).token_invalido, `painel mostra "Token inválido": "${(await texto("token-invalido"))?.slice(0, 60)}..."`);
    const chamadasAntes = chamadasSistema.length;
    await wa.evaluate(
      (msgs) => window.__piolhoEmitir(msgs),
      [{ id: `E2E${SUFIXO}F`, chat: CONTATO_WID, fromMe: false, t: agora - 10, body: "Oi?" }],
    );
    await esperar("item na fila", async () => (await status()).pendentes === 1);
    await new Promise((r) => setTimeout(r, 3000));
    await tickTeste();
    ok(chamadasSistema.length === chamadasAntes, "com token inválido nada é enviado (nenhuma chamada nova)");
    ok((await status()).pendentes === 1, "o item continua na fila");

    await painel.fill('[data-testid="campo-token"]', TOKEN);
    await painel.click('button[type="submit"]');
    const s5 = await esperar("volta a enviar com o token certo", async () => {
      const s = await status();
      return !s.token_invalido && s.pendentes === 0 ? s : null;
    });
    ok(s5.ultimo_envio.aceitos >= 1, "token certo: heartbeat e envio voltaram, fila zerada");
    if (db) {
      const banco4 = await contarBanco();
      ok(banco4.mensagens === 6, `banco: 6 mensagens no fim (${banco4.mensagens})`);
    }

    await print("final");
    ok(errosPainel.length === 0, `sem erros no painel ${errosPainel.length ? JSON.stringify(errosPainel) : ""}`);
    console.log("chamadas ao sistema:", JSON.stringify(chamadasSistema));
    console.log("\nE2E OK");
  } finally {
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
    if (db) await db.end();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
