# APIs do wa-js usadas pelo piolho

Versão vendorizada: `@wppconnect/wa-js` 4.6.0 (ver `vendor/wa-js/VERSION.md`). Todo acesso ao
`window.WPP` fica em `src/main-world/adapter.ts`; a conversão da mensagem em item do contrato fica
em `src/main-world/extracao.ts` (pura, sem `WPP`).

Regra: nenhuma API entra no código sem evidência na versão vendorizada (grep no
`vendor/wa-js/wppconnect-wa.js`) e, quando existe, na documentação oficial (Context7,
`/wppconnect-team/wa-js`). O bundle é minificado numa linha só; a evidência abaixo traz o trecho
literal e a posição em bytes (`grep -n -b -o -F '<trecho>' vendor/wa-js/wppconnect-wa.js`, linha 2).

## Etapa 1 (prontidão e número próprio)

| API | Uso | Evidência |
|-----|-----|-----------|
| `WPP.isReady` | wa-js carregou os módulos do WhatsApp | `t.isReady=!1` no loader; já usado na extensão de referência |
| `WPP.loader.onReady(cb)` | aviso de prontidão (com consulta a cada 500 ms como reserva) | extensão de referência |
| `WPP.conn.isAuthenticated()` | sessão logada | lista de exports de `conn` (`t.isAuthenticated=...`) |
| `WPP.conn.isMainReady()` | interface sincronizada | byte 265977: `t.isMainReady=function(){return o}` (vira true no evento `conn.main_ready`) |
| `WPP.conn.getMyUserId()` | número da conta logada | lista de exports de `conn` (`t.getMyUserId=...`) |
| `WPP.contact.getPnLidEntry`, `WPP.whatsapp.functions.getPhoneNumber` | resolução best-effort de `@lid` (`lid.ts`) | extensão de referência; confirmação prática na Etapa 5 |

## Etapa 4 (escuta ao vivo)

### `WPP.on("chat.new_message", cb)` e `WPP.off`

- Exports do emissor (byte 296413 e 296355): `t.on=t.ev.on.bind(t.ev)` e `t.off=t.ev.off.bind(t.ev)`.
- Os eventos internos são repassados ao emissor público (byte 295850):
  `t.internalEv.onAny((e,...r)=>{t.ev.emit(e,...r)`.
- Origem do evento (byte 136481 e 136832):
  `c.MsgStore.on("add",e=>{e.isNewMsg&&queueMicrotask(async()=>{"ciphertext"===(e=...).type&&e.once("change:type",()=>{queueMicrotask(()=>{s.internalEv.emit("chat.new_message",e)})}),s.internalEv.emit("chat.new_message",e)})})`

  Ou seja: o evento sai para TODA mensagem adicionada à `MsgStore` com `isNewMsg`, recebida ou
  enviada (não há filtro por `fromMe`). Mensagem ainda cifrada (`type === "ciphertext"`) é emitida
  uma vez assim e de novo quando o tipo muda (`change:type`); por isso o piolho ignora o tipo
  `ciphertext` e fica com a segunda emissão, já decifrada.
- Documentação (Context7, `_autodocs/events.md`):

  ```javascript
  WPP.on('chat.new_message', (msg) => {
    if (msg.fromMe) {
      console.log('I sent:', msg.body);
    } else {
      console.log('Received:', msg.body);
    }
  });
  ```

  A doc mostra o evento entregando mensagens enviadas e recebidas. Se ele dispara também para as
  mensagens enviadas PELO CELULAR (que chegam ao WhatsApp Web por sincronização) é a confirmação
  prática da Etapa 5. Pelo código acima, dispara se a mensagem entrar na `MsgStore` com
  `isNewMsg`.

Outros eventos existentes na 4.6.0 (grep por `"chat.`), não usados agora: `chat.msg_ack_change`,
`chat.msg_edited`, `chat.msg_revoke`, `chat.new_chat`, `chat.new_reaction`, `chat.live_location_start`.
Também existem `conn.main_ready`, `conn.authenticated` e `conn.logout` (grep por `"conn.`).

### Campos do objeto de mensagem (MsgModel)

Documentação (Context7, `src/whatsapp/models/MsgModel.ts`): `id: MsgKey`, `type?: string`,
`t?: number`, `notifyName?: any`, `from?: Wid`, `to?: Wid`, `author?: Wid`; em
`_autodocs/types.md`: `fromMe: boolean`, `senderObj: ContactModel`, `chat: ChatModel`.

| Campo | Uso no piolho | Evidência extra |
|-------|---------------|-----------------|
| `id._serialized` | `wa_msg_id` | contrato do servidor (exemplo `true_5562...@c.us_3EB0...`) |
| `id.fromMe` | direção (`out` se true); `msg.fromMe` como reserva | byte 137005: getter `chat` do wa-js usa `this.id.fromMe ? this.to : this.from` |
| `from` / `to` | `chat_id`: `from` na recebida, `to` na enviada (mesma regra do getter acima) | MsgModel.ts |
| `t` | `enviada_em` (unix em segundos, convertido para ISO) | MsgModel.ts |
| `type` | `tipo_midia` (mapa em `extracao.ts`) e filtro de notificações | lista de tipos em `_autodocs/types.md` |
| `notifyName` | `pushname` da recebida quando o contato não tem | MsgModel.ts |
| `isStatusV3` | descartar status | `.isStatusV3` aparece 6 vezes no bundle |

O corpo (`body`) NÃO é lido. `texto_abertura` e `ctwa` saem `null` até a Etapa 6 (os campos do
anúncio só entram depois de confirmados na Etapa 5, em `docs/CTWA.md`; `ctwaContext` não aparece no
bundle, então vem do próprio objeto do WhatsApp).

### `WPP.contact.get(id)` (ContactModel)

Usado para `nome_agenda` e `pushname` do contato do chat. Campos (getters registrados pelo wa-js):
byte 291282 `isMyContact:u.functions.getIsMyContact` e byte 292181
`formattedName:u.functions.getFormattedName`. `nome_agenda` = `name` (só existe para contato salvo)
ou, se `isMyContact`, `formattedName`; contato não salvo vai com `nome_agenda: null` (o
`formattedName` dele é o telefone formatado).

## Filtros aplicados (extracao.ts)

- Só chats individuais (`@c.us` e `@lid`): grupos `@g.us`, `status@broadcast`, listas de
  transmissão `@broadcast` e canais `@newsletter` ficam de fora.
- Conversa consigo mesmo (chat com o próprio número) fica de fora.
- Tipos ignorados: `e2e_notification`, `notification`, `notification_template`, `gp2`,
  `call_log`, `protocol`, `ciphertext`, `broadcast_notification`, `newsletter_notification`.
  `revoked` (apagada) vira `tipo_midia: "outro"`.
