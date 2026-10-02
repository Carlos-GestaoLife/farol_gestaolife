# Webhooks: configuração e teste real

Dois webhooks recebem leads de fora do sistema:

| Origem | Rota | Autenticação | Fonte em `entradas_brutas` | Chave de idempotência |
| --- | --- | --- | --- | --- |
| Formulários das LPs do Framer | `POST /api/webhooks/framer?k=SEGREDO` | segredo na query (`k`) | `framer` | sha256 do corpo interpretado |
| Lead Ads da Meta | `GET` e `POST /api/webhooks/meta` | `hub.verify_token` (GET) e `X-Hub-Signature-256` (POST) | `meta_lead` | `leadgen_id` |

As duas rotas ficam fora do proxy de sessão (não precisam de cookie). Toda entrada legítima é gravada
crua em `entradas_brutas` antes do processamento; se o processamento falhar, a entrada fica com status
`erro`, a mensagem em `erro` e é tentada de novo pelo reprocessamento (Etapa 10).

## Variáveis na Vercel

Projeto `farol-sistema-leads` > Settings > Environment Variables (Production). Sem elas, as rotas
respondem 503 com a variável que falta.

| Variável | De onde vem |
| --- | --- |
| `FRAMER_WEBHOOK_SECRET` | segredo interno: `openssl rand -hex 24` |
| `META_VERIFY_TOKEN` | segredo interno: `openssl rand -hex 24` (o mesmo valor vai no painel da Meta) |
| `META_APP_SECRET` | app da Meta > Configurações do app > Básico > Chave secreta do app |
| `META_PAGE_ACCESS_TOKEN` | token de acesso da página, de longa duração (ver abaixo) |

Depois de criar ou mudar uma variável, faça um novo deploy (Deployments > Redeploy) para ela valer.

## Framer (Etapa 5)

### Configurar

1. Gere o segredo (`openssl rand -hex 24`) e grave em `FRAMER_WEBHOOK_SECRET` na Vercel. Redeploy.
2. Em cada LP, no formulário: selecione o Form > painel da direita > **Send To** > **Webhook** e
   cole a URL:

   ```
   https://farol-sistema-leads.vercel.app/api/webhooks/framer?k=SEGREDO
   ```

   (troque `SEGREDO` pelo valor de `FRAMER_WEBHOOK_SECRET`).
3. Campos visíveis do formulário: **nome**, **telefone** (ou WhatsApp), **email**, **cidade**.
   O nome do campo pode ter acento e maiúsculas; o sistema aceita sinônimos
   (nome, name, nome completo; telefone, phone, whatsapp, celular, tel; email, e-mail; cidade, city).
4. Campos ocultos (Hidden) em todas as LPs, com estes nomes exatos, preenchidos pela URL da página:
   `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `origem`, `fbclid`.
   O `origem` é o código da origem cadastrada na tela Origens (usado na atribuição, Etapa 8).
5. O Framer também oferece assinatura própria (`Framer-Signature`, exige segredo de 32+ caracteres).
   Hoje a rota autentica só pelo `k`; o header `framer-webhook-submission-id` é guardado no payload
   para conferência.

### Testar com um envio real

1. Abra a LP publicada com UTMs na URL, por exemplo
   `...?utm_source=teste&utm_medium=manual&utm_campaign=webhook&origem=TESTE`, e envie o formulário
   com um telefone e e-mail seus.
2. Confira na tela **Saúde** (Etapa 9) ou no banco (console do Neon > SQL Editor):

   ```sql
   select id, status, tentativas, erro, recebido_em, payload
   from entradas_brutas
   where fonte = 'framer'
   order by recebido_em desc
   limit 5;
   ```

   Esperado: `status = 'processado'`. A pessoa e o evento:

   ```sql
   select e.ocorrido_em, e.canal, e.dados, p.nome_exibicao
   from eventos e join pessoas p on p.id = e.pessoa_id
   where e.tipo = 'form_enviado' and e.canal = 'lp_form'
   order by e.registrado_em desc
   limit 5;
   ```

3. Se a entrada ficou em `erro`:
   - "sem telefone nem e-mail válido": o Framer mandou os campos num formato ou com nomes que o
     extrator não reconheceu. Olhe o `payload` da entrada (o corpo cru está em `payload.corpo`), veja
     onde estão o telefone e o e-mail e ajuste `extrairCamposFramer` em `src/nucleo/framer.ts`
     (sinônimos em `SINONIMOS`, contêineres em `CONTEINERES`). Escreva um teste com o payload real
     em `src/nucleo/framer.test.ts`. Depois do deploy, o reprocessamento processa a entrada.
   - "Corpo do Framer não interpretado": o corpo não era JSON nem formulário; o texto cru está em
     `payload.corpo.bruto`. Ajuste `interpretarCorpoFramer`.
4. Reenviar exatamente o mesmo conteúdo não duplica (a resposta traz `duplicado: true`).

### Teste por curl

```bash
curl -i -X POST "https://farol-sistema-leads.vercel.app/api/webhooks/framer?k=SEGREDO" \
  -H "content-type: application/json" \
  -d '{"Nome":"Teste Curl","Telefone":"(62) 99999-0000","Email":"teste@exemplo.com","utm_source":"curl"}'
```

Resposta: `200 {"ok":true,"duplicado":false}`; com `k` errado, `401`.
Apague o lead de teste depois (ou deixe para a mescla/limpeza da gestão).

## Meta Lead Ads (Etapa 6)

### Como funciona

- `GET`: a Meta chama com `hub.mode=subscribe`, `hub.verify_token` e `hub.challenge`. Se o token
  bater com `META_VERIFY_TOKEN`, a rota devolve o `hub.challenge` em texto puro; senão 403.
- `POST`: a rota confere `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com `META_APP_SECRET`).
  Assinatura inválida ou ausente: 401 e nada é gravado (só um aviso no log). Válida: cada
  `entry[].changes[]` com `field = "leadgen"` vira uma entrada `meta_lead` (chave = `leadgen_id`) e a
  rota responde `200 {"ok":true,"recebidos":n,"duplicados":m}` na hora.
- Depois da resposta (com `after()` do Next, que na Vercel mantém a função viva até terminar),
  cada lead é buscado na Graph API
  (`GET /v21.0/{leadgen_id}?fields=field_data,ad_id,adset_id,campaign_id,form_id,created_time`,
  token no header `Authorization: Bearer`) e vira pessoa (telefone, e-mail e `meta_lead_id`) e evento
  `form_enviado` (canal `meta_form`). Falha na Graph API: entrada em `erro` com o status e a mensagem
  da Graph (sem o token), para o reprocessamento.

### Configurar

1. **App da Meta** (developers.facebook.com > Meus apps): use um app do tipo Business ligado ao
   Business Manager dono da página. Anote a **Chave secreta do app** (Configurações > Básico) em
   `META_APP_SECRET`.
2. Gere `META_VERIFY_TOKEN` com `openssl rand -hex 24` e grave na Vercel. Redeploy antes do passo 3
   (a Meta chama o GET na hora de salvar).
3. No app: **Webhooks** > selecione o objeto **Page** > **Assinar este objeto**:
   - URL de callback: `https://farol-sistema-leads.vercel.app/api/webhooks/meta`
   - Token de verificação: o valor de `META_VERIFY_TOKEN`
   - Depois de verificado, assine o campo **`leadgen`**.
4. **Token da página** com as permissões `leads_retrieval`, `pages_manage_ads`,
   `pages_show_list`, `pages_read_engagement` e `pages_manage_metadata`:
   - Caminho recomendado: Business Manager > Usuários do sistema > crie um usuário do sistema
     (Admin), atribua a página e o app a ele e gere um token com essas permissões. Token de usuário
     do sistema não expira. Depois troque-o pelo token da página:
     `GET /me/accounts?access_token=TOKEN_DO_USUARIO_DO_SISTEMA` e pegue o `access_token` da página.
   - Alternativa: no Graph API Explorer, gere um token de usuário com as permissões, troque por um
     de longa duração (`/oauth/access_token?grant_type=fb_exchange_token&...`) e pegue o token da
     página em `/me/accounts` (token de página derivado de token longo não expira).
   - Grave em `META_PAGE_ACCESS_TOKEN` na Vercel. Redeploy.
5. **Ligar a página ao app** (se a assinatura do passo 3 não fizer isso sozinha):
   `POST /{page_id}/subscribed_apps?subscribed_fields=leadgen` com o token da página.
6. No Business Manager > Configurações do negócio > Integrações > **Acesso a leads**: confirme que o
   app (ou o usuário do sistema) tem acesso aos leads da página. Sem isso a Graph API responde erro
   de permissão e as entradas ficam em `erro`.

### Testar com a ferramenta de teste de leads

1. Abra a **Lead Ads Testing Tool**: https://developers.facebook.com/tools/lead-ads-testing
2. Escolha a página e o formulário, clique em **Create lead** (apague antes o lead de teste
   anterior, a ferramenta só permite um por formulário) e depois em **Track status**.
3. Esperado no Track status: o webhook do app com resposta `200`.
4. Confira no banco:

   ```sql
   select id, chave_idempotencia as leadgen_id, status, tentativas, erro, recebido_em
   from entradas_brutas
   where fonte = 'meta_lead'
   order by recebido_em desc
   limit 5;
   ```

   Esperado: `status = 'processado'` e um evento `form_enviado` com canal `meta_form`:

   ```sql
   select e.ocorrido_em, e.dados, p.nome_exibicao
   from eventos e join pessoas p on p.id = e.pessoa_id
   where e.tipo = 'form_enviado' and e.canal = 'meta_form'
   order by e.registrado_em desc
   limit 5;
   ```

5. Se ficou em `erro`, a coluna `erro` traz o status HTTP e a mensagem da Graph API. Os casos comuns:
   - código 190 (token inválido ou expirado): gere de novo o `META_PAGE_ACCESS_TOKEN`;
   - código 100 ou 200 / permissão: falta `leads_retrieval`, o acesso a leads (passo 6) ou o token
     não é da página dona do formulário.
   Corrigido o token (e feito o redeploy), o reprocessamento (`POST /api/cron/reprocessar`, Etapa 10)
   processa a entrada; ela continua guardada.
6. Nada chegou (nem 401 no log da Vercel): a página não está ligada ao app (passo 5) ou o campo
   `leadgen` não está assinado. Status 401 no Track status: `META_APP_SECRET` não é a chave do app
   que assina o webhook.

### Teste por curl (simulado)

```bash
CORPO='{"object":"page","entry":[{"id":"1","time":1790000000,"changes":[{"field":"leadgen","value":{"leadgen_id":"123","page_id":"1","form_id":"2","ad_id":"3","created_time":1790000000}}]}]}'
ASSINATURA="sha256=$(printf '%s' "$CORPO" | openssl dgst -sha256 -hmac "$META_APP_SECRET" | sed 's/^.*= //')"
curl -i -X POST https://farol-sistema-leads.vercel.app/api/webhooks/meta \
  -H "content-type: application/json" -H "x-hub-signature-256: $ASSINATURA" -d "$CORPO"

curl -i "https://farol-sistema-leads.vercel.app/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=ok123"
```

O POST simulado responde 200 e grava a entrada, mas o processamento vai para `erro` (o lead `123`
não existe na Graph API). Apague a entrada de teste depois:
`delete from entradas_brutas where fonte = 'meta_lead' and chave_idempotencia = '123';`
