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

## Estrutura

```
manifest.config.ts            manifest gerado no build (permissões, content scripts)
vite.config.ts                passe 1: side panel, service worker, manifest, wa-js
vite.config.content.ts        passes 2 e 3: content.js e main-world.js (IIFE)
vendor/wa-js/                 wa-js vendorizado (VERSION.md)
public/                       ícones e fontes da marca (Gibson e Sora)
src/
  main-world/                 MAIN world: index.ts, adapter.ts (único que chama WPP.*), lid.ts, bridge-main.ts
  content/                    mundo isolado: relay validado até o service worker
  background/                 service worker e fila (fila.ts, esqueleto da Etapa 3)
  shared/                     protocol.ts (zod), phone.ts, config.ts, armazenamento.ts
  sidepanel/                  React: status e configuração
tests/                        Vitest
```

## Etapas

| # | Etapa | Situação |
|---|-------|----------|
| 1 | Setup copiado da extensão de grupos | Feita |
| 2 | Configuração (URL e token), detecção do número e heartbeat | Pendente (configuração e número já prontos) |
| 3 | Fila no service worker com envio em lote, reenvio, backoff e alarms | Pendente (esqueleto em `src/background/fila.ts`) |
| 4 | Escuta ao vivo (recebidas e enviadas) indo para a fila | Pendente |
| 5 | Etapa de descoberta (CTWA, celular, `@lid`) | Pendente |
| 6 | Regra do `texto_abertura` com os padrões e extração do `ctwa` | Pendente |
| 7 | Varredura desde o checkpoint | Pendente |
| 8 | Side panel de status e tratamento de erros | Pendente |

## Se o WhatsApp atualizar

Se o banner mostrar "Não consegui conectar ao WhatsApp. Provavelmente o WhatsApp atualizou e a
biblioteca precisa ser atualizada.", siga `vendor/wa-js/VERSION.md` para trocar o wa-js por uma
versão mais nova e refaça o build.
