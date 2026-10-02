# Farol Gestão Life

Monorepo do Sistema de Leads Gestão Life. O objetivo é medir o caminho completo do lead, da primeira
campanha até a compra do Gestão PRO (online ou presencial), unificando num só lugar os formulários da
Meta, as LPs do Framer (com UTMs), o WhatsApp capturado pela extensão "piolho" e as vendas (Hotmart,
plataforma do Gestão PRO e lançamento manual do vendedor). É independente do CRM do Carlos.

## Subprojetos

- `sistema-leads/`: aplicação Next.js (App Router, TypeScript). Banco Postgres no Neon com Drizzle;
  a troca de driver (Neon para Postgres na VPS) acontece só em `src/db/index.ts`. Especificação em
  `sistema-leads/CLAUDE.md`.
- `piolho/`: extensão Chrome (MV3) que roda no WhatsApp Web de qualquer PC do comercial e envia só
  metadados das conversas. O servidor deduplica. Especificação em `piolho/CLAUDE.md`.

Os dois NÃO compartilham código nem workspace: só conversam pela API HTTP do sistema
(contrato na seção "API de ingestão" do `sistema-leads/CLAUDE.md`).

## Regras de ouro

1. **Nada se perde.** Tudo é gravado cru em `entradas_brutas` antes de qualquer processamento.
2. **Idempotência.** `(fonte, chave_idempotencia)` é único; reenviar nunca duplica.
3. **`eventos` só recebe linhas novas.** Nunca UPDATE ou DELETE; correção é um evento novo.
4. **Telefone normalizado com o nono dígito.** Toda busca usa a forma canônica.
5. **Fila local com reenvio e checkpoint no piolho.** Item só sai da fila depois do aceite do servidor.

Do WhatsApp guardamos só metadados. Única exceção: `texto_abertura` (máx. 300 caracteres).
Textos de UI, comentários e documentação em português do Brasil, sem o caractere travessão longo.

## n8n (orquestrador)

O n8n é o orquestrador externo: recebe webhooks de terceiros quando for conveniente, dispara o
reprocessamento a cada 5 minutos (`POST /api/cron/reprocessar` com `Authorization: Bearer {CRON_SECRET}`)
e envia alertas (dispositivo sem sinal, entradas com erro). Ele NUNCA grava direto no banco: sempre
chama a API do sistema. O cron da Vercel fica só como fallback: `sistema-leads/vercel.json` agenda a mesma
rota uma vez por dia (06:00 UTC), e só funciona se `CRON_SECRET` existir no projeto da Vercel. Exemplo
de chamada para o n8n na seção "Reprocessamento" de `sistema-leads/docs/WEBHOOKS.md`.

## Deploy e migrações

Projeto Vercel `farol-sistema-leads`, com Root Directory `sistema-leads`. O comando de build na Vercel
é `npm run build:vercel`: em produção ele aplica as migrações versionadas (`src/db/migrations`) e o seed
idempotente antes do `next build`. Se a migração falhar, o deploy falha e a versão anterior continua no ar.
Deploys de preview não tocam no banco. Migração nova: `npm run db:generate` local, commit do SQL gerado e
push na main.

## Ordem de trabalho

Primeiro o `sistema-leads/` até a Etapa 4 (ingestão do WhatsApp pronta e testada); depois o `piolho/`.
