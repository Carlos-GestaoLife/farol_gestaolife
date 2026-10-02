# Sistema de Leads Gestão Life (Next.js)

Sistema que unifica todos os pontos de contato de um lead (formulário da Meta, formulário das LPs,
WhatsApp via extensão "piolho", eventos, vendas) numa linha do tempo por pessoa, para medir o
caminho completo: primeira campanha até a compra do Gestão PRO (online ou presencial).

Nesta fase o sistema é objetivo: ingestão confiável, kanban do comercial, linha do tempo e um painel
simples. Ele é independente do CRM do Carlos. Um eventual merge futuro é feito à parte.

## Regras de ouro

1. **Nada se perde.** Toda entrada é gravada em `entradas_brutas` ANTES de qualquer processamento.
   Se o processamento falhar, a entrada fica com status `erro` e pode ser reprocessada.
2. **Idempotência.** `(fonte, chave_idempotencia)` é único. Reenviar nunca duplica; duplicado é aceito sem efeito.
3. **`eventos` só recebe linhas novas.** Nunca UPDATE ou DELETE em evento. Correção é um evento novo.
4. **Sem conteúdo de conversa.** Do WhatsApp guardamos só metadados. Única exceção: `texto_abertura`
   (máx. 300 caracteres), usado para atribuição de origem.
5. **Acesso restrito.** Só usuários com papel `gestao` ou `comercial`. Toda tela e rota interna exige sessão.
   Rotas de ingestão exigem token de dispositivo ou assinatura do webhook.
6. **Portabilidade.** Hoje Neon, amanhã Postgres na VPS. Todo acesso ao banco passa por `src/db/index.ts`;
   trocar de banco é trocar o driver num lugar só.
7. UI em português do Brasil. Não usar o caractere travessão longo em textos da UI ou documentação.
8. Validar toda entrada com zod. Nunca confiar no payload.

## Stack

- Next.js (App Router, TypeScript). Server Actions para a UI, Route Handlers para ingestão e webhooks.
- Postgres no Neon (integração da Vercel). Drizzle ORM + drizzle-kit, migrações versionadas no repo.
- Driver: `drizzle-orm/neon-serverless` (WebSocket, com transações interativas) agora; `drizzle-orm/node-postgres`
  em localhost e se migrar para a VPS. O núcleo (normalização, identidade, entradas) fica em `src/nucleo/`.
- Auth: Better Auth com adapter Drizzle, e-mail e senha, papéis `gestao` e `comercial`.
  Cadastro fechado: só a gestão cria usuário.
- UI: Tailwind + shadcn/ui. Kanban com dnd-kit.
- Testes: vitest (normalização, identidade, atribuição, idempotência).
- Deploy: Vercel.

## Modelo de dados

Nomes de tabela e coluna em português, snake_case. `id` uuid, datas em timestamptz.

**entradas_brutas**: `id`, `fonte` (whatsapp | meta_lead | framer | hotmart | manual | outra),
`chave_idempotencia`, `payload` jsonb, `recebido_em`, `status` (pendente | processado | erro | ignorado),
`tentativas`, `erro`, `processado_em`. UNIQUE(fonte, chave_idempotencia). Índice em status.

**pessoas**: `id`, `nome_exibicao`, `estagio_id`, `responsavel_id` (usuário), `origem_primeiro_toque_id`,
`primeiro_contato_em`, `ultimo_contato_em`, `motivo_perda`, `opt_out` bool, `mesclada_para_id` (nullable),
`mesclada_em`, `criado_em`, `atualizado_em`. Campos de origem e datas são cache derivado de eventos e
podem ser recalculados.

**identificadores**: `id`, `pessoa_id`, `tipo` (telefone | email | wa_id | meta_lead_id), `valor` (normalizado),
`valor_original`, `criado_em`. UNIQUE(tipo, valor).

**eventos**: `id`, `pessoa_id`, `tipo` (form_enviado | conversa_iniciada | estagio_alterado | responsavel_alterado |
reuniao_agendada | ingresso_comprado | checkin_evento | venda_registrada | identidade_mesclada | nota),
`ocorrido_em`, `registrado_em`, `canal` (whatsapp | meta_form | lp_form | hotmart | presencial | manual),
`origem_id`, `numero_monitorado`, `usuario_id` (quem fez, se manual), `entrada_bruta_id`, `dados` jsonb
(UTMs, ids de anúncio, estágio de/para etc.). Índice em (pessoa_id, ocorrido_em).

**mensagens** (só metadados, alto volume): `id`, `pessoa_id`, `numero_monitorado`, `wa_msg_id`, `chat_id`,
`direcao` (in | out), `tipo_midia` (texto | audio | imagem | video | documento | figurinha | localizacao | contato | outro),
`enviada_em`, `texto_abertura` (nullable), `ctwa` jsonb (nullable), `dispositivo_id`, `entrada_bruta_id`.
UNIQUE(numero_monitorado, wa_msg_id). Índice em (pessoa_id, enviada_em).
Uma mensagem recebida após 30 dias sem nenhuma mensagem naquele chat gera também um evento `conversa_iniciada`.

**origens**: `id`, `codigo` (único), `nome`, `tipo` (anuncio_ctwa | link_whatsapp | qr_code | form_meta | lp |
organico | indicacao | desconhecida), `padrao_texto` (texto pré-preenchido, normalizado), `meta_campaign_id`,
`meta_adset_id`, `meta_ad_id`, `meta_form_id`, `utm_source`, `utm_medium`, `utm_campaign`, `cidade`, `evento`,
`produto`, `ativo`, `criada_automaticamente` bool.

**estagios**: `id`, `nome`, `ordem`, `tipo` (aberto | ganho | perdido), `gatilho_automatico` (tipo de evento que
move para cá, nullable).

**numeros**: `numero` (canônico), `apelido`, `papel` (central | sdr | vendedor), `usuario_id`.

**dispositivos**: `id`, `nome` (ex.: "PC Comercial 1"), `usuario_id`, `token_hash`, `numero_detectado`,
`ultimo_sinal_em`, `ultimo_sync_em`, `fila_pendente`, `versao_extensao`, `ativo`.

**fila_revisao**: `id`, `tipo` (conflito_identidade | outro), `pessoa_a_id`, `pessoa_b_id`, `motivo`,
`entrada_bruta_id`, `status` (aberta | resolvida | descartada), `resolvido_por`, `resolvido_em`.

**vendas** (Fase 2): `id`, `pessoa_id`, `produto`, `valor_centavos`, `canal` (online | presencial), `evento`,
`fonte` (vendedor | hotmart | outra_plataforma), `referencia_externa`, `registrada_por`, `ocorrida_em`,
`conciliacao_status` (pendente | conciliada | divergente), `venda_par_id`.

Mais as tabelas do Better Auth (usuários com campo `papel`).

## Normalização

- **Telefone:** só dígitos, com DDI. Com 10 ou 11 dígitos e sem DDI, assumir 55.
- **Nono dígito (Brasil):** IDs antigos do WhatsApp vêm sem o 9 (55 + DDD + 8 dígitos). Forma canônica
  = 13 dígitos com o 9 quando o número local de 8 dígitos começar com 6, 7, 8 ou 9. Toda busca usa a
  canônica. Testes obrigatórios com os dois formatos, senão a mesma pessoa vira duas.
- **E-mail:** minúsculo, sem espaços.
- **wa_id:** guardar como veio (`...@c.us` ou `...@lid`). Se for `@c.us`, derivar também o telefone canônico.
- **Texto para casar padrão:** minúsculo, sem acento, espaços colapsados, sem emoji.

## Resolução de identidade

Para cada entrada, montar a lista de identificadores normalizados e buscar as pessoas donas deles:

- **Nenhuma:** cria pessoa e identificadores.
- **Uma:** vincula e adiciona os identificadores novos a ela.
- **Duas ou mais:** NÃO mescla. Vincula o registro à pessoa casada pelo identificador mais forte
  (telefone > wa_id > email > meta_lead_id) e abre um item em `fila_revisao`.

Mescla só pela tela (papel `gestao`): move identificadores, eventos e mensagens para a sobrevivente,
marca a outra com `mesclada_para_id` e grava evento `identidade_mesclada`. Nada é apagado.

## Atribuição de origem

WhatsApp, nesta ordem:
1. Contexto do anúncio de clique para WhatsApp (`ctwa`, com o id do anúncio) → origem pelo `meta_ad_id`.
   Se o anúncio não estiver cadastrado, criar origem automática "Anúncio não cadastrado {id}" (`criada_automaticamente`).
2. `texto_abertura` casa com `padrao_texto` (igual ou "começa com", após normalizar).
3. Sem casamento → origem "WhatsApp direto (desconhecida)".

Formulário Meta: por `form_id` e `ad_id`. LP Framer: por UTMs e campo oculto `origem`.

Primeiro toque = primeiro evento com origem da pessoa. Último toque = último evento com origem antes da
venda. O painel mostra os dois lado a lado. Todos os toques ficam gravados.

## API de ingestão

### POST /api/ingest/whatsapp
Auth: `Authorization: Bearer <token do dispositivo>` (comparar com `token_hash`). Token inválido → 401.

```json
{
  "versao_extensao": "0.1.0",
  "numero_monitorado": "5562999999999",
  "itens": [
    {
      "wa_msg_id": "true_5562...@c.us_3EB0...",
      "chat_id": "5562...@c.us",
      "direcao": "in",
      "enviada_em": "2026-10-02T14:03:11Z",
      "tipo_midia": "texto",
      "contato": { "wa_id": "5562...@c.us", "telefone": "5562...", "nome_agenda": null, "pushname": "Maria" },
      "texto_abertura": "Olá! Quero saber do Gestão na Veia Maceió",
      "ctwa": null
    }
  ]
}
```

Máximo de 100 itens por chamada. Cada item vira uma linha em `entradas_brutas` com chave
`{numero_monitorado}:{wa_msg_id}`. Resposta 200: `{ "aceitos": [wa_msg_id...], "erros": [{ "wa_msg_id", "motivo" }] }`.
Aceito significa gravado em `entradas_brutas` (processado ou não). Duplicado conta como aceito.
O servidor descarta `texto_abertura` que não cumprir a regra (abertura de conversa ou padrão cadastrado).

### POST /api/ingest/heartbeat
Mesmo token. Body: `{ numero_monitorado, versao_extensao, fila_pendente, ultimo_sync_em }`.
Atualiza o dispositivo. Resposta: `{ ultimo_sync_servidor, padroes_texto: [string] }`
(os padrões permitem à extensão saber quando mandar `texto_abertura`).

### GET e POST /api/webhooks/meta
GET: conferir `hub.verify_token` com `META_VERIFY_TOKEN` e devolver `hub.challenge`.
POST: validar `X-Hub-Signature-256` com `META_APP_SECRET`; gravar cada `leadgen_id` em `entradas_brutas`
(chave = leadgen_id) e responder 200 rápido. O processamento busca o lead na Graph API
(`field_data`, `ad_id`, `adset_id`, `campaign_id`, `form_id`, `created_time`) com `META_PAGE_ACCESS_TOKEN`.
Falha na Graph API → status `erro`, entra no reprocessamento.

### POST /api/webhooks/framer?k={FRAMER_WEBHOOK_SECRET}
Gravar o payload cru. Chave = sha256 do payload. Campos esperados nas LPs: nome, telefone, email, cidade
e os ocultos `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `origem`, `fbclid`.
Validar na prática o formato que o Framer envia antes de escrever o parser.

### Fase 2
`POST /api/webhooks/hotmart` (validar `hottok`, chave = transação + evento) e o webhook da plataforma
onde o Gestão PRO é pago (a definir).

### Reprocessamento
`/api/cron/reprocessar` protegido por `CRON_SECRET`: reprocessa `pendente` e `erro` com `tentativas < 10`.
Também um botão na tela Saúde. Atenção: no plano Hobby da Vercel o cron só roda uma vez por dia.

## Telas

1. **Kanban** (comercial): colunas = estágios. Card com nome, telefone, origem do primeiro toque,
   responsável e há quanto tempo está sem resposta. Arrastar gera evento `estagio_alterado` com usuário e hora.
2. **Leads:** lista com busca e filtros (origem, cidade, estágio, responsável, período).
3. **Pessoa:** dados, identificadores, linha do tempo (eventos + mensagens agregadas por dia, ex.:
   "12 recebidas, 9 enviadas, 1ª resposta em 4 min"), notas, mudar estágio e responsável.
4. **Origens** (gestão): cadastro de códigos, textos pré-preenchidos, QR Codes e anúncios.
5. **Painel** (gestão): leads por origem, cidade e período; primeiro x último toque; conversão por estágio;
   tempo médio de primeira resposta por número; leads sem resposta.
6. **Saúde** (gestão): dispositivos e último sinal (alerta se mais de 15 min sem sinal em horário comercial),
   fila pendente de cada um, entradas com erro, fila de revisão de identidade.
7. **Usuários e números** (gestão).

## Estágios iniciais (seed, editáveis)

Novo lead · Em conversa · Qualificado · Reunião agendada · Ingresso comprado · Participou do evento ·
Negociação · Cliente Gestão PRO (ganho) · Perdido (perdido, com motivo).

Movimentos automáticos (só para frente, nunca para trás):
primeira mensagem enviada após uma recebida → Em conversa; `ingresso_comprado` → Ingresso comprado;
`checkin_evento` → Participou do evento; venda Gestão PRO conciliada → Cliente Gestão PRO.

## Variáveis de ambiente

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `META_APP_SECRET`, `META_VERIFY_TOKEN`,
`META_PAGE_ACCESS_TOKEN`, `FRAMER_WEBHOOK_SECRET`, `CRON_SECRET`. Fase 2: `HOTMART_HOTTOK`.

## Ordem de implementação (testar cada etapa antes da próxima)

1. Setup: Next.js, Tailwind, shadcn, Drizzle, Neon, schema completo, primeira migração, seed de estágios e origem "desconhecida".
2. Auth com papéis, layout e proteção de rotas. Criar o primeiro usuário `gestao` por script.
3. Núcleo: normalização (com testes do nono dígito), resolução de identidade (com testes de conflito), gravação idempotente em `entradas_brutas`.
4. Dispositivos (gerar token na tela, mostrar uma vez), `/api/ingest/heartbeat` e `/api/ingest/whatsapp`. Testar com curl, inclusive reenvio duplicado.
5. Webhook do Framer. Testar com um envio real da LP.
6. Webhook da Meta. Testar com a ferramenta de teste de leads da Meta.
7. Telas Leads, Pessoa e Kanban.
8. Origens e atribuição (ctwa, padrão de texto, UTMs), com testes.
9. Painel e tela Saúde (dispositivos, erros, revisão de identidade, mescla).
10. Reprocessamento (cron e botão).

Fase 2: Hotmart, venda manual do vendedor, webhook da plataforma do Gestão PRO e tela de Conciliação
(venda do vendedor x venda da plataforma, casando por pessoa, produto, valor e janela de dias).

## n8n (orquestrador)

O n8n é o orquestrador externo: recebe webhooks de terceiros quando for conveniente, dispara o reprocessamento a cada 5 minutos e envia alertas (dispositivo sem sinal, entradas com erro). Ele NUNCA grava direto no banco: sempre chama a API do sistema. Para o reprocessamento, chama `POST /api/cron/reprocessar` com o header `Authorization: Bearer {CRON_SECRET}`. Isso substitui o cron da Vercel (plano Hobby roda só uma vez por dia), que fica como fallback.

## Fora de escopo agora

Enviar mensagens, LLM, download de mídia, qualquer conexão com o banco do CRM do Carlos.
