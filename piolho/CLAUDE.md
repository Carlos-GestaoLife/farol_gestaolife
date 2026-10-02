# Piolho: extensão Chrome (MV3) que escuta o WhatsApp Web

Extensão que roda no WhatsApp Web de qualquer computador da equipe (comercial, SDR, vendedores),
captura os METADADOS de todas as conversas individuais (recebidas e enviadas) e manda para o
Sistema de Leads. O contrato da API está no `CLAUDE.md` do Sistema de Leads (seção "API de ingestão").

## Base

Mesmo setup da extensão de exportar grupos: wa-js vendorizado no MAIN world, ponte validada com o
content script, service worker, side panel em React.

CAMINHO: `<<PREENCHER com o caminho local da extensão de exportar grupos>>`

Antes da etapa 1, ler esse repositório e replicar: config do Vite, geração do manifest, build do MAIN
world, a ponte e os scripts do `package.json`. Reaproveitar a lógica best-effort de resolução de `@lid`.

## Regras

- **Só lê.** Nunca envia mensagem, nunca marca como lida, nunca entra em grupo.
- **Só conversas individuais.** Ignorar grupos (`@g.us`), status (`status@broadcast`), canais (`@newsletter`) e listas de transmissão.
- **Sem conteúdo.** Só metadados. Única exceção: `texto_abertura` (máx. 300 caracteres) quando a mensagem
  RECEBIDA (a) abre conversa, ou seja, não há nenhuma mensagem naquele chat nos 30 dias anteriores, ou
  (b) o texto normalizado casa com um dos `padroes_texto` recebidos no heartbeat.
- **Nada se perde.** Toda mensagem entra na fila local antes do envio e só sai quando o servidor devolver o
  `wa_msg_id` em `aceitos`. O checkpoint só avança depois do aceite.
- **Qualquer computador.** Configura URL do sistema e token uma vez. O número é detectado automaticamente.
- Textos da UI em português do Brasil. Não usar o caractere travessão longo.

## Arquitetura

- **MAIN world (wa-js):** detecta o próprio número, escuta mensagens novas, faz a varredura e extrai metadados.
  Manda itens pela ponte.
- **Content script:** valida o que vem da ponte e repassa ao service worker via `chrome.runtime.sendMessage`.
  Informa também o estado (WPP pronto ou não).
- **Service worker:** dono da fila (IndexedDB da extensão). Envia em lotes de até 100, com reenvio e backoff
  exponencial (teto de 5 min). `chrome.alarms` a cada 1 min para esvaziar a fila e mandar o heartbeat
  (só se a aba do WhatsApp estiver aberta e o WPP pronto).
- **Side panel:** status e configuração.

O envio sai do service worker (não do content script), para usar o storage da extensão e não depender do CSP da página.

## Fluxo

1. **Início:** esperar o WPP ficar pronto, ler o próprio número, mandar heartbeat, receber
   `ultimo_sync_servidor` e `padroes_texto`.
2. **Varredura:** checkpoint = o maior entre o checkpoint local daquele número e `ultimo_sync_servidor`.
   Para cada chat individual com última mensagem depois do checkpoint (limite: 30 dias atrás), carregar as
   mensagens até alcançar o checkpoint e enfileirar. Um chat por vez, com pausa curta entre eles.
3. **Ao vivo:** escutar mensagens novas, recebidas e enviadas (inclusive as enviadas pelo celular) e enfileirar.
4. **Erros:** 401 → parar de enviar e mostrar "token inválido" no painel. Rede ou 5xx → manter na fila e tentar de novo.

## Item enviado (resumo do contrato)

`wa_msg_id`, `chat_id`, `direcao` (in | out), `enviada_em` (ISO), `tipo_midia`,
`contato` { `wa_id`, `telefone`, `nome_agenda`, `pushname` }, `texto_abertura` (ou null), `ctwa` (ou null).
O `contato` sai completo em toda mensagem; o servidor ignora o que já sabe.

## Validar na prática (etapa de descoberta, antes de codar a extração)

- Logar no console o objeto de uma mensagem vinda de anúncio de clique para WhatsApp e descobrir onde
  vem o contexto do anúncio (id, link, título). Não chutar nomes de campo: confirmar e documentar em `docs/CTWA.md`.
- O evento de mensagem nova dispara para mensagens enviadas pelo celular?
- Em chats `@lid`, dá para obter o número real?
- Quanto histórico o WhatsApp Web carrega depois de dias fechado.

## Side panel

Conectado ou não, número detectado, nome do dispositivo, fila pendente, último envio, último erro,
botão "Forçar varredura", configuração (URL do sistema e token).

## Permissões

`sidePanel`, `storage`, `alarms`. `host_permissions`: `https://web.whatsapp.com/*` e a URL do sistema.
Injeção no MAIN world pelo manifest (`"world": "MAIN"`, `run_at: document_start`).

## Ordem de implementação (testar cada etapa antes da próxima)

1. Setup copiado da extensão de grupos.
2. Configuração (URL e token), detecção do número e heartbeat. Conferir na tela Saúde do sistema.
3. Fila no service worker com envio em lote, reenvio, backoff e alarms. Testar derrubando a internet.
4. Escuta ao vivo (recebidas e enviadas) indo para a fila.
5. Etapa de descoberta (CTWA, celular, `@lid`), registrando o que foi encontrado.
6. Regra do `texto_abertura` com os padrões e extração do `ctwa`.
7. Varredura desde o checkpoint. Testar fechando o Chrome, recebendo mensagens no celular e reabrindo.
8. Side panel de status e tratamento de erros.
