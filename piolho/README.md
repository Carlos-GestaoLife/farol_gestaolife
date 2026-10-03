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

Ao salvar, o painel avisa o service worker (sem mandar o token: ele relê do `chrome.storage.local`),
que manda um heartbeat na hora. A seção "Envio ao sistema" mostra o último heartbeat, até quando o
servidor está sincronizado, os padrões de texto recebidos, a fila pendente, os rejeitados, o último
envio e o erro atual (em vermelho). Com "Token inválido" (401), nada é enviado até salvar um token
novo, gerado na tela Dispositivos.

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

## Teste de ponta a ponta (manual)

Com o Sistema de Leads rodando local (`cd ../sistema-leads && npm run dev`, Postgres de teste) e
um dispositivo criado na tela Dispositivos:

```bash
PIOLHO_SISTEMA_URL=http://localhost:3000 npm run build
PIOLHO_E2E_TOKEN=pio_... DATABASE_URL=postgresql://... npm run e2e
```

O roteiro (`tests/e2e/roteiro.mjs`) abre o Chromium do Playwright com a extensão, troca o
web.whatsapp.com por uma página com um `WPP` falso e confere heartbeat, envio de 3 mensagens
(banco: 1 pessoa, 3 mensagens, conversa iniciada, estágio "Em conversa"), reenvio sem duplicar,
"internet caída" (fila com backoff e volta) e token inválido. `DATABASE_URL` é opcional (sem ela,
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
  main-world/                 MAIN world: index.ts, adapter.ts (único que chama WPP.*), extracao.ts, lid.ts, bridge-main.ts
  content/                    mundo isolado: relay validado até o service worker
  background/                 service worker, api.ts (cliente HTTP), fila.ts (IndexedDB), envio.ts,
                              backoff.ts, checkpoint.ts, estado-execucao.ts (chrome.storage.session)
  shared/                     protocol.ts (zod), phone.ts, config.ts, armazenamento.ts
  sidepanel/                  React: status, envio e configuração
docs/WA-JS.md                 APIs do wa-js usadas, com a evidência
tests/                        Vitest; tests/e2e/roteiro.mjs (manual, npm run e2e)
```

## Etapas

| # | Etapa | Situação |
|---|-------|----------|
| 1 | Setup copiado da extensão de grupos | Feita |
| 2 | Configuração (URL e token), detecção do número e heartbeat | Feita |
| 3 | Fila no service worker com envio em lote, reenvio, backoff e alarms | Feita |
| 4 | Escuta ao vivo (recebidas e enviadas) indo para a fila | Feita (envio pelo celular: confirmar na Etapa 5) |
| 5 | Etapa de descoberta (CTWA, celular, `@lid`) | Pendente |
| 6 | Regra do `texto_abertura` com os padrões e extração do `ctwa` | Pendente |
| 7 | Varredura desde o checkpoint | Pendente |
| 8 | Side panel de status e tratamento de erros | Pendente |

## Se o WhatsApp atualizar

Se o banner mostrar "Não consegui conectar ao WhatsApp. Provavelmente o WhatsApp atualizou e a
biblioteca precisa ser atualizada.", siga `vendor/wa-js/VERSION.md` para trocar o wa-js por uma
versão mais nova e refaça o build.
