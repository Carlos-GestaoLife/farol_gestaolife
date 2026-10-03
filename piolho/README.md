# Piolho

Extensão do Chrome (Manifest V3) que roda no WhatsApp Web de qualquer computador da equipe e envia
só os METADADOS das conversas individuais para o Sistema de Leads Gestão Life. Especificação
completa em `CLAUDE.md`; contrato da API na seção "API de ingestão" do `sistema-leads/CLAUDE.md`.

Os dados vêm da store interna do WhatsApp Web pela biblioteca `@wppconnect/wa-js`, vendorizada em
`vendor/wa-js/` (ver `VERSION.md`). O setup (Vite em 3 passes, manifest gerado, wa-js no MAIN world,
ponte validada, side panel em React) foi copiado da extensão de referência
`https://github.com/Carlos-GestaoLife/extrator_contatos`.

## Build

Requer Node 22 (ou 20.19+). O piolho tem o próprio `package.json` e não compartilha nada com o
`sistema-leads/`.

```bash
npm install
npm run build
```

O resultado fica em `dist/`. Outros comandos:

- `npm run typecheck`: checagem de tipos (inclui os testes).
- `npm test`: testes unitários com Vitest (`tests/`).
- `npm run e2e`: roteiro manual de ponta a ponta contra o sistema local (ver abaixo). Não roda no
  `npm test`.

### Build de desenvolvimento (sistema local)

```bash
PIOLHO_SISTEMA_URL=http://localhost:3000 npm run build
```

A URL vira o padrão da configuração do painel e entra em `host_permissions` do manifest (como
`http://localhost/*`; a permissão de host ignora a porta). Esse build também aceita a mensagem de
teste `tick_teste` (tick do alarm na hora, ignorando o backoff), usada pelo roteiro e2e. Sem a
variável, o build aponta para `https://farol-sistema-leads.vercel.app` e ignora `tick_teste`.
URL inválida (nem https, nem http://localhost) faz o build falhar.

O build roda em 3 passes: `vite.config.ts` gera o side panel, o service worker (ESM), o
`manifest.json` e copia o wa-js; `vite.config.content.ts` gera `content.js` e `main-world.js`
(IIFE, porque content scripts não carregam ESM).

## Instalar no Chrome (modo desenvolvedor)

1. Abra `chrome://extensions`.
2. Ligue o "Modo do desenvolvedor" (canto superior direito).
3. Clique em "Carregar sem compactação" e escolha a pasta `dist/`.
4. Abra (ou recarregue) a aba do `https://web.whatsapp.com`.
5. Clique no ícone do Piolho: o side panel abre na lateral.

Depois de cada `npm run build`, clique no botão de recarregar do card da extensão e recarregue
também a aba do WhatsApp Web.

## Configurar

No side panel, seção "Configuração" (uma vez por computador):

- **URL do sistema**: já vem com `https://farol-sistema-leads.vercel.app`. Para usar outro
  endereço (por exemplo `http://localhost:3000` em desenvolvimento), digite e salve: o Chrome pede
  permissão de acesso ao novo endereço. Sem essa permissão a extensão não consegue falar com o
  sistema.
- **Token do dispositivo**: gerado na tela Dispositivos do Sistema de Leads (aparece uma vez só).
  Cole e salve. Depois de salvo, o painel só mostra "Configurado"; o token nunca volta para a tela.

O número do WhatsApp é detectado sozinho e aparece no banner ("Conectado ao WhatsApp.").

- **Nome deste computador** (opcional): só aparece no painel ("Este computador"), para saber qual
  PC é qual. Não vai para o sistema (o nome oficial do dispositivo fica na tela Dispositivos).

Ao salvar, o painel avisa o service worker (sem mandar o token: ele relê do `chrome.storage.local`),
que manda um heartbeat na hora.

## O painel

- **Banner:** conectado ou não ao WhatsApp e o número detectado.
- **Envio ao sistema:** nome deste computador, último heartbeat, até quando o servidor está
  sincronizado, padrões de texto recebidos (lista expansível), fila pendente, rejeitados (contador
  e lista expansível dos últimos 20, com o `wa_msg_id` abreviado e o motivo), último envio, hora da
  próxima tentativa (quando o envio está esperando o backoff) e o erro atual (em vermelho). Botão
  "Enviar heartbeat agora".
- **Varredura:** progresso ("Varrendo chat 12 de 40, 350 itens enfileirados", com barra), botões
  "Forçar varredura" e "Cancelar".
- **Diagnóstico:** botão "Modo descoberta" (ver abaixo).
- **Configuração:** URL, token e nome do computador.

Erros: "Token inválido" (401) para o envio até salvar um token novo, gerado na tela Dispositivos.
Rede ou erro no sistema (5xx): tudo fica na fila e o envio volta sozinho em 1, 2, 4 e depois a cada
5 min (o painel mostra a hora da próxima tentativa).

## Como funciona o envio

- MAIN world: `WPP.on("chat.new_message")` (ver `docs/WA-JS.md`) entrega cada mensagem nova,
  recebida ou enviada; `extracao.ts` descarta grupos, status, canais, listas de transmissão,
  notificações e o chat próprio, e monta o item só com metadados.
- Content script: valida com zod e repassa ao service worker.
- Service worker: grava na fila (IndexedDB, banco `piolho`, chave `numero:wa_msg_id`) e envia em
  2 s, em lotes de até 100. O item só sai da fila quando o servidor devolve o `wa_msg_id` em
  `aceitos`; os citados em `erros` vão para "rejeitados" (os 500 mais recentes ficam guardados).
  Rede ou 5xx: tudo fica na fila e o envio volta em 1, 2, 4 e depois a cada 5 min. 4xx: reenvia
  item a item uma vez para isolar o item ruim. O checkpoint por número (`chrome.storage.local`) só
  avança com o aceite.
- Alarm `piolho-tick` (1 min): heartbeat e esvaziar a fila, só com a aba do WhatsApp pronta.

## Texto de abertura e anúncio (Etapa 6)

- `texto_abertura`: só em mensagem RECEBIDA de texto e só quando (a) ela abre a conversa (nenhuma
  mensagem daquele chat nos 30 dias anteriores, pelo histórico local do WhatsApp Web; se o
  histórico não basta para afirmar, vale só a regra b) ou (b) o texto casa com um dos padrões
  cadastrados nas origens (recebidos no heartbeat). Casar é a mesma regra do servidor: minúsculo,
  sem acento, sem emoji, espaços colapsados, e o texto é igual ao padrão ou COMEÇA com ele
  (`src/shared/texto.ts`). Cortado em 300 caracteres sem partir emoji. Fora disso, `null`.
- `ctwa`: só os campos do anúncio (`sourceId`, `sourceType`, `sourceUrl`, `title`, `description`,
  `mediaType`, `isSuspiciousLink`, nas duas grafias) de `ctwaContext` ou
  `contextInfo.externalAdReply`; nunca thumbnails, mídia ou texto. O servidor extrai o id do
  anúncio. Caminhos a confirmar no WhatsApp real (`docs/CTWA.md`).
- Os padrões chegam ao MAIN world pela ponte: o service worker publica `padroes` para a aba depois
  de cada heartbeat e quando a aba pede (`obter_padroes`).

## Varredura (Etapa 7)

Busca o que chegou enquanto o Chrome estava fechado. Para cada conversa individual com atividade
depois do checkpoint, lê as mensagens para trás até alcançá-lo (no máximo 2000 por chat), um chat
por vez com pausa de 300 ms, e manda cada uma para a fila (a fila e o servidor deduplicam).

- **Checkpoint** = o maior entre o checkpoint local do número (maior `enviada_em` aceito),
  `ultimo_sync_servidor` (do heartbeat) e agora menos 30 dias.
- **Quando roda:** sozinha depois do primeiro heartbeat com a aba do WhatsApp pronta (de novo a
  cada recarga da aba ou troca de conta), a cada 6 h, e pelo botão "Forçar varredura".
- **"Forçar varredura"** ignora o checkpoint local e o do servidor: relê os últimos 30 dias de
  todas as conversas individuais. Serve para recuperar algo que ficou para trás; não duplica nada.
- Uma varredura por vez; "Cancelar" para entre um chat e outro. O progresso fica em
  `chrome.storage.session` e aparece no painel.
- A varredura não mexe no checkpoint: ele só avança com os aceitos do servidor.

## Modo descoberta (Etapa 5, só diagnóstico)

Botão "Modo descoberta" no painel (grava `piolho_descoberta = true` em `chrome.storage.local`).
Ligado, cada mensagem nova é logada no console da aba do WhatsApp (DevTools, contexto "top", filtro
`piolho descoberta`) com um resumo (`ctwaContext`, `contextInfo.externalAdReply`, `id.fromMe`,
`self`, `isNewMsg`, `type`, `from`, `to`, `author`, `sender`) e o objeto bruto SEM `body`, legenda,
mensagem citada, mídia e thumbnails. Nada disso vai para o sistema. Roteiro completo e tabela para
preencher em `docs/CTWA.md`. Desligue quando terminar.

## Teste de ponta a ponta (manual)

Com o Sistema de Leads rodando local (`cd ../sistema-leads && npm run dev`, Postgres de teste) e
um dispositivo criado na tela Dispositivos:

```bash
PIOLHO_SISTEMA_URL=http://localhost:3000 npm run build
PIOLHO_E2E_TOKEN=pio_... DATABASE_URL=postgresql://... npm run e2e
```

O modo headless padrão do Playwright (headless shell) não carrega extensões: se o service worker
não aparecer em 15 s, aponte `PIOLHO_E2E_CHROMIUM` para o Chromium completo (por exemplo
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

O roteiro (`tests/e2e/roteiro.mjs`) abre o Chromium do Playwright com a extensão, troca o
web.whatsapp.com por uma página com um `WPP` falso (com `chat.list` e `chat.getMessages` sobre um
histórico falso) e confere: heartbeat e varredura automática de início; envio de 3 mensagens
(banco: 1 pessoa, 3 mensagens, conversa iniciada, estágio "Em conversa"), reenvio sem duplicar,
"internet caída" (fila com backoff e volta) e token inválido; (a) padrão cadastrado numa origem
chega no heartbeat, a mensagem que casa vai com `texto_abertura` e "oi" no mesmo chat vai sem, e a
pessoa fica com a origem; (b) `ctwaContext` falso com `sourceId` cria a origem "Anúncio não
cadastrado 123456789"; (d) modo descoberta loga no console sem o `body`; (c) "Forçar varredura"
com 3 chats individuais e 1 grupo envia só os 30 dias dos individuais, mostra o progresso no
painel e não duplica ao rodar de novo. O roteiro cria uma origem de teste (código
`e2e-gestao-na-veia-...`). `DATABASE_URL` é opcional (sem ela,
as conferências no banco são puladas); `PIOLHO_E2E_CHROMIUM` aponta outro executável do Chromium;
`PIOLHO_E2E_PRINTS` salva capturas do painel. Rode com o banco de teste limpo, porque o roteiro
conta as mensagens do contato de teste.

## Estrutura

```
manifest.config.ts            manifest gerado no build (permissões, content scripts)
vite.config.ts                passe 1: side panel, service worker, manifest, wa-js
vite.config.content.ts        passes 2 e 3: content.js e main-world.js (IIFE)
vendor/wa-js/                 wa-js vendorizado (VERSION.md)
public/                       ícones e fontes da marca (Gibson e Sora)
src/
  main-world/                 MAIN world: index.ts, adapter.ts (único que chama WPP.*), extracao.ts (item e ctwa),
                              abertura.ts (regra do texto_abertura), varredura.ts, descoberta.ts, lid.ts, bridge-main.ts
  content/                    mundo isolado: relay validado até o service worker
  background/                 service worker, api.ts (cliente HTTP), fila.ts (IndexedDB), envio.ts,
                              backoff.ts, checkpoint.ts, estado-execucao.ts (chrome.storage.session)
  shared/                     protocol.ts (zod), phone.ts, config.ts, armazenamento.ts, texto.ts (igual ao
                              servidor), varredura.ts (checkpoint)
  sidepanel/                  React: status, envio, varredura, diagnóstico e configuração
docs/WA-JS.md                 APIs do wa-js usadas, com a evidência
docs/CTWA.md                  descoberta no WhatsApp real (anúncio, celular, @lid, histórico) e roteiro
tests/                        Vitest; tests/e2e/roteiro.mjs (manual, npm run e2e)
```

## Etapas

| # | Etapa | Situação |
|---|-------|----------|
| 1 | Setup copiado da extensão de grupos | Feita |
| 2 | Configuração (URL e token), detecção do número e heartbeat | Feita |
| 3 | Fila no service worker com envio em lote, reenvio, backoff e alarms | Feita |
| 4 | Escuta ao vivo (recebidas e enviadas) indo para a fila | Feita (envio pelo celular: confirmar no WhatsApp real) |
| 5 | Etapa de descoberta (CTWA, celular, `@lid`) | Feita no código (modo descoberta e `docs/CTWA.md`); falta o Eduardo rodar o roteiro no WhatsApp real |
| 6 | Regra do `texto_abertura` com os padrões e extração do `ctwa` | Feita (caminhos do `ctwa` a confirmar no WhatsApp real) |
| 7 | Varredura desde o checkpoint | Feita (testada com WhatsApp falso; o teste "fechar o Chrome e reabrir" é o passo 6 do roteiro) |
| 8 | Side panel de status e tratamento de erros | Feita |

## Se o WhatsApp atualizar

Se o banner mostrar "Não consegui conectar ao WhatsApp. Provavelmente o WhatsApp atualizou e a
biblioteca precisa ser atualizada.", siga `vendor/wa-js/VERSION.md` para trocar o wa-js por uma
versão mais nova e refaça o build.
