# Etapa 5: descoberta no WhatsApp real (CTWA, celular, `@lid`, histórico)

Este documento junta o que a documentação e o bundle do wa-js 4.6.0 (`vendor/wa-js/wppconnect-wa.js`)
dizem sobre quatro perguntas, o que o piolho faz hoje com base nisso, e o roteiro para o Eduardo
confirmar tudo no WhatsApp Web de verdade. Nada aqui foi confirmado no WhatsApp real: não dá para
rodá-lo no ambiente de desenvolvimento. Onde está "a confirmar", o código foi escrito de forma
tolerante (lê os dois caminhos possíveis, aceita campo ausente) e o roteiro diz como conferir.

## 1. De onde vem o contexto do anúncio (clique para WhatsApp)

**O que o wa-js mostra:** nada. No bundle 4.6.0 não existe nenhuma ocorrência de `ctwa`,
`ctwaContext`, `externalAdReply`, `AdReply`, `sourceId`, `sourceUrl` nem `isSuspiciousLink`
(`grep -o -i -F '<termo>' vendor/wa-js/wppconnect-wa.js | wc -l` dá 0 para todos). `contextInfo`
aparece 9 vezes, todas no envio de mensagens de pedido (`sendOrderStatusMessageAsMerchant`), sem
relação com anúncio. A documentação do wa-js (Context7, `/wppconnect-team/wa-js`) não descreve
nenhum campo de anúncio no `MsgModel`; a interface termina em `[key: string]: any`. Ou seja: se o
contexto existir, ele vem do próprio modelo de mensagem do WhatsApp Web, sem o wa-js no meio.

**O que se espera encontrar (a confirmar):** o WhatsApp Web costuma expor dois caminhos, que o
piolho lê os dois:

| Caminho | Campos esperados |
|---------|------------------|
| `msg.ctwaContext` | `sourceUrl`, `sourceId`, `sourceType`, `title`, `description`, `mediaType`, `thumbnail` (base64), `thumbnailUrl`, `conversionSource`, `ctwaClid`, `isSuspiciousLink` |
| `msg.contextInfo.externalAdReply` | `title`, `body`, `mediaType`, `thumbnailUrl`, `mediaUrl`, `thumbnail`, `sourceType`, `sourceId`, `sourceUrl`, `containsAutoReply`, `renderLargerThumbnail`, `showAdAttribution`, `ctwaClid`, `ref` |

**O que o piolho manda (Etapa 6, `extrairCtwa` em `src/main-world/extracao.ts`):** um objeto plano
só com `source_id`/`sourceId`, `source_type`/`sourceType`, `source_url`/`sourceUrl` (URL inteira:
ela pode carregar o `ad_id`), `title`, `description`, `media_type`/`mediaType` e
`is_suspicious_link`/`isSuspiciousLink`, de qualquer um dos dois caminhos (`ctwaContext` tem
preferência). Nunca vão: thumbnails e mídia (base64), o `body` do anúncio, `ctwaClid` (id do
clique, não do anúncio) nem qualquer outro campo. Sem contexto, `ctwa` é `null`.

**O que o servidor faz:** `extrairMetaAdIdDoCtwa` (sistema-leads/src/nucleo/atribuicao.ts) pega o
id do anúncio em `ad_id`/`adId`, em `source_id`/`sourceId` (só se `source_type`/`sourceType` for
`ad` ou vier vazio) ou no parâmetro `ad_id` da `source_url`/`sourceUrl`. Conferido com o objeto de
exemplo dos testes (`sourceId: "123456789"`, `sourceType: "ad"`): o servidor extrai `123456789`;
com `sourceType: "post"` não extrai nada. Anúncio sem origem cadastrada vira a origem automática
"Anúncio não cadastrado {id}" (testado no e2e).

**Pontos a confirmar:** em qual dos dois caminhos o contexto vem; se `sourceId` é mesmo o id do
anúncio no Gerenciador da Meta (e não de outra coisa, como a publicação); se `sourceType` vem como
`"ad"`; se o contexto aparece só na PRIMEIRA mensagem da conversa (a que veio do anúncio) ou em
todas.

## 2. Mensagens enviadas pelo celular disparam o evento de mensagem nova?

**O que o bundle mostra (byte 136481, ver `docs/WA-JS.md`):** o evento `chat.new_message` sai de
`MsgStore.on("add")` para toda mensagem com `isNewMsg`, sem filtrar por `fromMe`. Mensagens
enviadas pelo celular chegam ao WhatsApp Web por sincronização e entram na `MsgStore`; se entram
com `isNewMsg = true`, disparam o evento. **A confirmar** no WhatsApp real (passo 4 do roteiro).
Se não dispararem, a varredura (Etapa 7, a cada 6 h e ao abrir o WhatsApp) cobre o buraco, porque
ela lê o histórico do chat, que inclui as enviadas pelo celular.

## 3. Em chats `@lid`, dá para obter o número real?

**O que o piolho faz (`src/main-world/lid.ts`, mesma lógica da extensão de grupos):** tenta, em
ordem, (a) o campo `phoneNumber` do próprio contato (`WPP.contact.get`), (b)
`WPP.whatsapp.functions.getPhoneNumber(wid)` (cache interno LID para telefone) e (c)
`WPP.contact.getPnLidEntry(lid)`. As três leem só caches locais do WhatsApp Web; nenhuma consulta
o servidor do WhatsApp. Se nenhuma souber, o item sai com `telefone: null` e `wa_id` igual ao
`@lid` (o servidor aceita e identifica a pessoa pelo `wa_id`).

**Limites:** o WhatsApp só mapeia LID para telefone quando a conta já viu o número (contato salvo,
conversa antiga pelo número, grupo em comum com o número visível). Lead novo que chega por `@lid`
(típico de anúncio e de privacidade de número) pode ficar sem telefone até o mapeamento aparecer;
mensagens seguintes do mesmo chat mandam o `contato` completo de novo, então o servidor recebe o
telefone assim que o piolho souber. Dígitos de um `@lid` nunca são tratados como telefone.
**A confirmar:** qual das três fontes funciona na versão atual e em que proporção de chats `@lid`.

## 4. Quanto histórico o WhatsApp Web carrega depois de dias fechado?

A varredura usa `WPP.chat.getMessages` (ver `docs/WA-JS.md`), que consulta o armazenamento LOCAL
do WhatsApp Web (`msgFindQuery`). Página vazia é tratada como "fim do histórico local". **A
confirmar:** (a) depois de dias com o Chrome fechado, se o WhatsApp Web sincroniza as mensagens do
período antes de a varredura rodar (ela roda depois do primeiro heartbeat, alguns segundos depois
do login); (b) se `getMessages` com `direction: "before"` busca no celular mensagens mais antigas
que as já sincronizadas; (c) se a lista de conversas (`WPP.chat.list`) traz `t` (última atividade)
preenchido para todas as conversas. O limite da varredura é 30 dias e 2000 mensagens por chat.

A regra (a) do `texto_abertura` também depende disso: "página vazia antes da mensagem" vale como
"nenhuma mensagem anterior". Se o WhatsApp Web devolver página vazia para conversas antigas cujo
histórico não foi sincronizado, a primeira mensagem dessas conversas iria com texto (o servidor
ainda descarta se já tiver mensagem daquele chat nos 30 dias anteriores). **A confirmar** no
passo 6 do roteiro.

## Roteiro de descoberta (para o Eduardo)

Precisa de: o repositório, Node 22, um Chrome com o WhatsApp Web logado num número de teste (ou do
comercial), um celular com esse WhatsApp e, se possível, alguém para clicar num anúncio de clique
para WhatsApp da Gestão Life e mandar a mensagem pré-preenchida.

1. **Build de desenvolvimento.** Na pasta `piolho/`: `npm install` e depois
   `PIOLHO_SISTEMA_URL=http://localhost:3000 npm run build` (sistema local) ou só `npm run build`
   (produção). Em `chrome://extensions`, "Modo do desenvolvedor", "Carregar sem compactação" e
   escolha `piolho/dist/`. Configure URL e token no painel, como no README.
2. **Ligar o modo descoberta.** No painel do Piolho, seção "Diagnóstico", clique em "Modo
   descoberta" (aparece o aviso amarelo). Isso grava `piolho_descoberta = true` em
   `chrome.storage.local`. É só para diagnóstico: o log fica só no console do seu computador,
   nada vai para o sistema.
3. **Abrir o DevTools no contexto certo.** Na aba do `web.whatsapp.com`, F12, aba "Console". No
   seletor de contexto (o menu "top" no alto do console), deixe em **top** (é o MAIN world, onde o
   wa-js roda). No filtro, digite `piolho descoberta`. Ao ligar o modo, aparece
   `[piolho descoberta] modo descoberta LIGADO`.
4. **Mensagem enviada pelo celular.** Pelo celular, mande uma mensagem para um contato de teste.
   Veja se aparece um `[piolho descoberta] resumo` com `id.fromMe: true`. Anote também `self`,
   `isNewMsg` e `type`.
5. **Mensagem de anúncio (CTWA).** Peça para alguém clicar num anúncio de clique para WhatsApp e
   mandar a mensagem. No console, abra o `resumo` e veja `ctwaContext` e
   `contextInfo.externalAdReply`; depois abra o `objeto (sem body e sem mídia)` e procure qualquer
   outro campo com cara de anúncio (`source`, `ad`, `conversion`, `referral`). Clique com o botão
   direito no objeto e use "Copy object" para colar na tabela. O log NUNCA mostra o texto da
   mensagem (`body`), legenda, mensagem citada, mídia nem thumbnails.
6. **Abertura de conversa e histórico.** Com o Chrome fechado por pelo menos um dia, receba
   mensagens no celular, abra o Chrome e o WhatsApp Web e espere a seção "Varredura" do painel
   dizer "Varredura concluída". Confira na tela do sistema se as mensagens do período chegaram.
   Num contato que nunca falou com o número, mande "oi" e veja no sistema se a mensagem chegou com
   texto de abertura (deve chegar); num contato antigo, mande "oi" e veja que chega sem texto.
7. **Chat `@lid`.** Num chat cujo `from` no `resumo` termina em `@lid`, veja no sistema se a pessoa
   ficou com telefone.
8. **Desligar.** Clique em "Desligar modo descoberta" no painel.

### O que o Eduardo encontrou (preencher)

| Pergunta | Resultado | Exemplo (sem texto da mensagem) |
|----------|-----------|----------------------------------|
| Caminho do contexto do anúncio (`ctwaContext` ou `contextInfo.externalAdReply` ou outro) | | |
| Campos presentes no contexto (`sourceId`, `sourceType`, `sourceUrl`, `title`, ...) | | |
| `sourceId` é o id do anúncio no Gerenciador da Meta? | | |
| O contexto vem só na primeira mensagem ou em todas? | | |
| Mensagem enviada pelo celular dispara o log (`id.fromMe: true`)? | | |
| Valores de `self` e `isNewMsg` nas enviadas pelo celular | | |
| Chats `@lid`: a pessoa ficou com telefone? Em quantos de quantos? | | |
| Depois de quantos dias fechado a varredura ainda achou as mensagens? | | |
| "oi" de contato novo chegou com texto de abertura? E de contato antigo, sem? | | |
| Versão do WhatsApp Web (rodapé de Configurações, Ajuda) e data do teste | | |

Com a tabela preenchida, ajustar `extrairCtwa` (campos e caminhos), `docs/WA-JS.md` e este
documento, trocando "a confirmar" pelo que foi visto.
