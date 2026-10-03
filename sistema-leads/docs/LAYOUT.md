# Layout do Sistema de Leads Gestão Life

Briefing para o redesenho da interface no Claude Design. Tudo aqui foi tirado do código atual
(`sistema-leads/src`) e dos screenshots de teste. Onde um screenshot é de uma versão anterior, o texto
segue o código (em `tela-kanban.png`, `tela-leads.png` e `tela-pessoa.png` o rodapé do menu e a ficha
da pessoa são de versões anteriores; valem `rodape-menu.png` e `tela-pessoa-toques.png`).

Convenções deste documento:

- Textos entre aspas são exatamente como aparecem na tela (pt-BR).
- `{chaves}` marcam valores dinâmicos.
- O círculo preto com um "N" que aparece no canto dos screenshots é o indicador de desenvolvimento do
  Next.js. Não faz parte do produto e não deve ser desenhado.

## 1. Visão geral do produto
- **O que é:** um sistema interno que junta num só lugar todos os contatos de um lead da Gestão Life
  (formulários da Meta, formulários das LPs do Framer, conversas de WhatsApp capturadas pela extensão
  "piolho" e, na Fase 2, vendas) numa linha do tempo por pessoa, da primeira campanha até a compra do Gestão PRO.
- **Quem usa:** dois papéis. **Gestão** (vê tudo e configura) e **Comercial** (atende os leads).
- **Objetivo do Comercial:** saber quem está esperando resposta, mover o lead pelos estágios do funil
  (Kanban), registrar notas e responsável.
- **Objetivo da Gestão:** cadastrar origens (links, QR Codes, anúncios), acompanhar o Painel (de onde vêm
  os leads, conversão, tempo de resposta) e cuidar da Saúde do sistema (dispositivos, erros, conflitos de identidade).
- O sistema não envia mensagens: o atendimento acontece no WhatsApp Web; o sistema só lê metadados.

## 2. Fundamentos visuais atuais
**A identidade visual atual é a padrão do shadcn/ui, estilo "new-york", cor base "neutral"** (tons de
cinza puros, sem cor de marca). O designer tem liberdade total para aplicar a marca Gestão Life (cores,
tipografia, logotipo, ilustrações), **mantendo a estrutura**: shell com barra lateral, ordem do menu,
blocos de cada tela, campos, colunas, textos e regras descritos aqui.

### 2.1 Paleta (tokens em `src/app/globals.css`)
Os valores estão em oklch no código. O hex ao lado é a conversão aproximada para sRGB.

**Tema claro (`:root`), o único em uso hoje:**

| Token | oklch | Hex aprox. | Uso |
| --- | --- | --- | --- |
| `--background` | oklch(1 0 0) | #ffffff | Fundo da página |
| `--foreground` | oklch(0.145 0 0) | #0a0a0a | Texto principal |
| `--card` | oklch(1 0 0) | #ffffff | Fundo dos cards |
| `--card-foreground` | oklch(0.145 0 0) | #0a0a0a | Texto nos cards |
| `--popover` | oklch(1 0 0) | #ffffff | Menus suspensos |
| `--popover-foreground` | oklch(0.145 0 0) | #0a0a0a | Texto nos menus |
| `--primary` | oklch(0.205 0 0) | #171717 | Botão primário (quase preto) |
| `--primary-foreground` | oklch(0.985 0 0) | #fafafa | Texto do botão primário |
| `--secondary` | oklch(0.97 0 0) | #f5f5f5 | Badge secundário, botão secundário |
| `--secondary-foreground` | oklch(0.205 0 0) | #171717 | Texto sobre secondary |
| `--muted` | oklch(0.97 0 0) | #f5f5f5 | Fundos discretos (colunas do Kanban a 40%) |
| `--muted-foreground` | oklch(0.556 0 0) | #737373 | Subtítulos, descrições, datas |
| `--accent` | oklch(0.97 0 0) | #f5f5f5 | Hover de botões ghost/outline |
| `--accent-foreground` | oklch(0.205 0 0) | #171717 | Texto em hover |
| `--destructive` | oklch(0.577 0.245 27.325) | #e7000b | Erros, badge "Erro", "Sem sinal", "Opt-out" |
| `--border` | oklch(0.922 0 0) | #e5e5e5 | Bordas |
| `--input` | oklch(0.922 0 0) | #e5e5e5 | Borda dos campos |
| `--ring` | oklch(0.708 0 0) | #a1a1a1 | Anel de foco |
| `--sidebar` | oklch(0.985 0 0) | #fafafa | Fundo da barra lateral e da barra do topo |
| `--sidebar-foreground` | oklch(0.145 0 0) | #0a0a0a | Texto da barra lateral |
| `--sidebar-primary` | oklch(0.205 0 0) | #171717 | Círculo do avatar |
| `--sidebar-primary-foreground` | oklch(0.985 0 0) | #fafafa | Inicial do avatar |
| `--sidebar-accent` | oklch(0.97 0 0) | #f5f5f5 | Item de menu ativo e hover |
| `--sidebar-accent-foreground` | oklch(0.205 0 0) | #171717 | Texto do item ativo |
| `--sidebar-border` | oklch(0.922 0 0) | #e5e5e5 | Borda da barra lateral |
| `--sidebar-ring` | oklch(0.708 0 0) | #a1a1a1 | Foco na barra lateral |
| `--grafico-serie` | (hex no código) | #2a78d6 | Única cor de série dos gráficos do Painel (azul) |

**Tema escuro (classe `.dark`):** os tokens existem no CSS, mas nada no código aplica a classe `.dark`
nem há alternador de tema. Na prática o sistema roda só no tema claro. Valores definidos:

| Token | Valor escuro |
| --- | --- |
| `--background` / `--foreground` | oklch(0.145 0 0) #0a0a0a / oklch(0.985 0 0) #fafafa |
| `--card`, `--popover`, `--sidebar` | oklch(0.205 0 0) #171717 |
| `--primary` / `--primary-foreground` | oklch(0.922 0 0) #e5e5e5 / oklch(0.205 0 0) #171717 |
| `--secondary`, `--muted`, `--accent` / `--muted-foreground` | oklch(0.269 0 0) #262626 / oklch(0.708 0 0) #a1a1a1 |
| `--destructive` | oklch(0.704 0.191 22.216) #ff6467 |
| `--border` / `--input` / `--ring` | branco a 10% / branco a 15% / oklch(0.556 0 0) #737373 |
| `--sidebar-primary` | oklch(0.488 0.243 264.376) #1447e6 |
| `--grafico-serie` | #3987e5 |

**Cores fora dos tokens (classes Tailwind diretas):**

| Onde | Classes | Efeito |
| --- | --- | --- |
| Badge "Sem resposta há X" (Kanban) | `border-amber-500/40`, `text-amber-700` | Contorno e texto âmbar |
| Caixa do token (Dispositivos) | `border-amber-500/40`, `bg-amber-500/5`, ícone `text-amber-600` | Caixa de aviso âmbar clara |
| Avisos de erro em bloco (Início, Kanban) | `border-destructive/30`, `bg-destructive/5`, `text-destructive` | Faixa vermelha clara |
| QR Code | `bg-white` | Fundo branco fixo |
| Overlay dos dialogs | `bg-black/50` | Preto a 50% |

### 2.2 Tipografia
- **Nenhuma fonte é carregada** (`src/app/layout.tsx` não importa fonte). Vale a pilha padrão do
  Tailwind: `ui-sans-serif, system-ui, sans-serif` (fonte do sistema operacional). Nos screenshots
  (Linux) aparece uma sans genérica tipo Arial/Liberation.
- Monoespaçada (`font-mono`, pilha padrão do Tailwind) em: código da origem, chave de idempotência,
  link gerado do WhatsApp, padrão de texto gravado, token do dispositivo.
- `antialiased` no `<html>`. Idioma `pt-BR`.
- `tabular-nums` em telefones, contagens e números de tabela.

| Elemento | Tamanho e peso |
| --- | --- |
| Título de página (h1) | `text-2xl` (24px), `font-semibold`, `tracking-tight` |
| Título de card | 16px, `font-semibold`, `leading-none` |
| Título de dialog | `text-lg` (18px), `font-semibold` |
| Título do login | `text-xl` (20px) |
| Subtítulo de página e descrição de card | `text-sm` (14px), cor `muted-foreground` |
| Texto de corpo, tabelas, botões, labels | `text-sm` (14px); labels `font-medium` |
| Detalhes (datas na linha do tempo, ajudas, mensagens em células) | `text-xs` (12px) |
| Inputs | 16px no celular, 14px a partir de `md` |
| Nome do sistema na barra lateral | 14px `font-semibold` + "Gestão Life" 12px cinza |

### 2.3 Espaçamentos, raios e sombras
- `--radius: 0.625rem` (10px). Derivados: `sm` 6px, `md` 8px, `lg` 10px, `xl` 14px.
- Cards: `rounded-xl` (14px), borda 1px, `shadow-sm`, padding vertical 24px, padding lateral 24px,
  espaço de 24px entre cabeçalho e conteúdo.
- Botões, inputs, selects, badges: `rounded-md` (8px). Colunas do Kanban: `rounded-lg`.
- Avatar: círculo (`rounded-full`) de 36px.
- Espaço entre blocos da página: 24px (`gap-6`); no Kanban 16px (`gap-4`).
- Padding do conteúdo principal: 16px no celular, 32px a partir de `md`.
- Grade de formulários: 16px entre campos (`gap-4`), 8px entre label e campo (`gap-2`).
- Sombras: `shadow-xs` em botões e campos, `shadow-sm` em cards, `shadow-lg` em dialogs e no cartão
  sendo arrastado, `shadow-md` no menu suspenso.

### 2.4 Densidade
Densidade média de ferramenta administrativa: controles de 36px de altura (botão pequeno 32px),
linhas de tabela com 8px de padding, tabelas largas com rolagem horizontal. Muito texto explicativo em
descrições de card (é intencional: o sistema explica as regras na própria tela).

### 2.5 Ícones
Biblioteca **lucide-react**. Tamanho padrão 16px (`size-4`); 12px dentro de badges e dos metadados do
cartão do Kanban.

| Ícone lucide | Onde |
| --- | --- |
| `House`, `SquareKanban`, `Users`, `Signpost`, `ChartColumn`, `Activity`, `UserCog`, `MonitorSmartphone` | Menu, na ordem: Início, Kanban, Leads, Origens, Painel, Saúde, Usuários e números, Dispositivos (`Signpost` também marca a origem no cartão do Kanban) |
| `Menu`, `LogOut` | Botão do menu suspenso (celular); botão Sair |
| `Phone`, `UserRound`, `Clock` | Cartão do Kanban: telefone, responsável, badge "Sem resposta há X" |
| `ChevronLeft` / `ChevronRight` | Recolher / expandir coluna do Kanban |
| `MessageSquare` / `StickyNote` | Linha do tempo: item de mensagens / item de evento |
| `Plus`, `Download` | "Novo lead", "Nova origem"; "Baixar QR Code (SVG)" |
| `TriangleAlert`, `Copy` / `Check` | Aviso do token mostrado uma vez; copiar / copiado |
| `ChevronDown`, `X` | Seta dos selects; fechar dialog |

## 3. Shell da aplicação
Arquivos: `src/app/(app)/layout.tsx`, `src/components/app/navegacao.tsx`, `src/components/app/botao-sair.tsx`.

### 3.1 Telas médias e grandes (a partir de 768px): barra lateral
- Largura fixa **256px** (`w-64`), fundo `--sidebar`, borda direita, altura total.
- **Topo:** "Sistema de Leads" (14px negrito) e embaixo "Gestão Life" (12px cinza). Padding 16px x 20px.
- Separador horizontal.
- **Menu** (rolável se faltar altura), padding 12px, itens empilhados com 4px de espaço.
  Cada item: ícone 16px + rótulo 14px, padding 12px x 8px, cantos 8px.
  - Normal: texto a 80% de opacidade; hover com fundo `sidebar-accent`.
  - **Ativo:** fundo `sidebar-accent` (cinza claro), texto `font-medium`, `aria-current="page"`.
    Regra: "/" só fica ativo na própria raiz; os demais ficam ativos na rota e nas sub-rotas
    (ex.: `/origens/nova` ativa "Origens"). A ficha `/pessoas/[id]` não ativa nenhum item.
- Separador horizontal.
- **Rodapé** (padding 16px, 12px entre linhas):
  - Linha 1: avatar circular 36px (fundo `sidebar-primary`, quase preto) com a **inicial do nome** em
    maiúscula; ao lado o **nome** (14px, truncado) e o **papel** ("Gestão" ou "Comercial", 12px cinza).
  - Linha 2: botão **"Sair"** de largura total, variante outline, tamanho pequeno, ícone `LogOut`,
    alinhado à esquerda. Enquanto sai: "Saindo..." e desabilitado. Depois vai para `/login`.

Ordem dos itens (fixa):

| # | Rótulo | Rota | Ícone | Papel |
| --- | --- | --- | --- | --- |
| 1 | Início | `/` | House | todos |
| 2 | Kanban | `/kanban` | SquareKanban | todos |
| 3 | Leads | `/leads` | Users | todos |
| 4 | Origens | `/origens` | Signpost | só gestão |
| 5 | Painel | `/painel` | ChartColumn | só gestão |
| 6 | Saúde | `/saude` | Activity | só gestão |
| 7 | Usuários e números | `/usuarios` | UserCog | só gestão |
| 8 | Dispositivos | `/dispositivos` | MonitorSmartphone | só gestão |

```
+------------------------+------------------------------------------------+
| Sistema de Leads       |   Título da página                             |
| Gestão Life            |   Subtítulo em cinza                           |
|------------------------|   +----------------------------------------+   |
| [ic] Início            |   | Card                                   |   |
| [ic] Kanban   (ativo)  |   +----------------------------------------+   |
| [ic] Leads             |   +----------------------------------------+   |
| [ic] Origens ... (8)   |   | Card                                   |   |
|------------------------|   +----------------------------------------+   |
| (G) Gestão Teste       |                                                |
|     Gestão             |                                                |
| [ Sair              ]  |                                                |
+------------------------+------------------------------------------------+
   256px                    conteúdo: até 1024px centralizado
```

### 3.2 Telas pequenas (abaixo de 768px): barra no topo
- A barra lateral some. No topo: faixa com fundo `--sidebar`, borda inferior, padding 16px x 8px.
- À esquerda: "Sistema de Leads Gestão Life" (14px negrito). À direita: botão só ícone (`Menu`, ghost,
  36px) com rótulo acessível "Abrir menu".
- Ao tocar, abre um **menu suspenso** alinhado à direita, 240px de largura:
  1. Cabeçalho: nome (truncado) e papel (12px cinza).
  2. Separador.
  3. Itens do menu do papel, com ícone (mesma lista e ordem da barra lateral).
  4. Separador.
  5. "Sair".
- O menu suspenso não marca o item ativo.

```
+--------------------------------------------+
| Sistema de Leads Gestão Life          [=]  |
+--------------------------------------------+
                         +----------------------+
                         | Gestão Teste / Gestão|
                         |----------------------|
                         | [ic] Início ... (8)  |
                         |----------------------|
                         | Sair                 |
                         +----------------------+
```

### 3.3 Área de conteúdo
- Ocupa o resto da largura. Padding 16px (celular) ou 32px (desktop).
- **Largura máxima de 1024px** (`max-w-5xl`), centralizada.
- **Telas largas** usam a largura total (sem limite): Kanban, Leads, Origens (lista), Painel e Saúde.
  (Marcadas no código com `data-largura="total"`.) Início, Pessoa, Nova origem, Detalhe da origem,
  Usuários e números e Dispositivos ficam limitadas a 1024px.

### 3.4 Cabeçalho de página (padrão)
- Bloco com h1 (24px semibold) e, embaixo, subtítulo de 14px cinza com 4px de espaço.
- Quando há ação principal (Leads, Origens), o bloco vira linha: título à esquerda, botão primário à
  direita alinhado pela base, com quebra de linha em telas estreitas.
- Telas de detalhe (Pessoa, Origem, Nova origem) têm acima do título um link cinza de volta
  ("Voltar para Leads", "Voltar para Origens"), sublinhado no hover.

### 3.5 Cards
Quase todo bloco de conteúdo é um Card: título, descrição em cinza (frequentemente explicando a regra)
e conteúdo. Sem ação no cabeçalho do card (o slot existe no componente mas não é usado).

### 3.6 Mensagens de sucesso e erro (`MensagemAcao`)
Arquivo `src/components/app/mensagem-acao.tsx`. É o padrão de retorno de quase toda ação.

- Parágrafo de texto simples, 14px (às vezes 12px dentro de tabelas), **sem caixa, sem ícone, sem toast**.
- **Sucesso:** cor `muted-foreground` (cinza), papel de acessibilidade `status`.
- **Erro:** cor `destructive` (vermelho), papel `alert`.
- Fica ao lado do botão que disparou a ação (na mesma linha, quebrando se faltar espaço) ou embaixo do
  controle, em células de tabela.
- Algumas mensagens de sucesso vêm com um link ao lado: "Abrir a ficha", "Abrir a pessoa que ficou".
- Em listas onde a linha some depois da ação (Saúde), a última mensagem fica **acima** da tabela ou da lista.

Outros avisos existentes:

| Tipo | Visual | Onde |
| --- | --- | --- |
| Faixa de erro | caixa com borda vermelha a 30%, fundo vermelho a 5%, texto vermelho, cantos 8px | Início (sem permissão), Kanban (falha ao mover) |
| Aviso de truncamento | caixa com borda cinza, texto 12px cinza | Linha do tempo da Pessoa |
| Rodapé de coluna | texto 12px cinza com borda superior | Kanban (coluna com mais cartões que o limite) |
| Alerta forte | texto vermelho 14px `font-medium` | Saúde ("{n} dispositivo(s) sem sinal.") |
| Erro de formulário de login | texto vermelho 14px | Login |
| Caixa de token | borda e fundo âmbar, ícone de alerta | Dispositivos |

### 3.7 Estados de carregamento
Não há telas de carregamento, skeletons nem spinners (nenhum `loading.tsx`). As páginas são renderizadas
no servidor. O único feedback de espera é o **texto do botão** mudando e o botão desabilitado:
"Entrando...", "Saindo...", "Salvando...", "Criando...", "Adicionando...", "Gerando...",
"Recalculando...", "Reprocessando...", "Mesclando...". Selects da ficha da Pessoa ficam desabilitados
enquanto salvam. O Kanban move o cartão na hora (otimista) e desfaz se der erro.

Página não encontrada (id inválido de pessoa ou origem) usa a página 404 padrão do Next.js (não há
página personalizada).

### 3.8 Tabelas
- Componente `Table` do shadcn: contêiner com rolagem horizontal, texto 14px, cabeçalho de 40px de altura
  com texto `font-medium` na cor normal, linhas com borda inferior e hover `muted/50`, células com 8px de
  padding e sem quebra de linha (exceto onde o código libera: nomes, erros, códigos).
- Colunas numéricas alinhadas à direita com `tabular-nums`.
- Valor ausente aparece como "-" (traço curto) ou célula vazia, conforme a tela.
- Linhas de itens **inativos** (origens, dispositivos) ficam com o texto inteiro em cinza.
- Nome da pessoa e código/nome da origem são links (sublinham no hover).
- Sem ordenação por clique nem seleção de linhas. Paginação só na tela Leads.

### 3.9 Badges
| Variante | Visual | Usos |
| --- | --- | --- |
| `secondary` | fundo cinza claro, sem borda | estágio da pessoa, total da coluna do Kanban, "Ativa", "Ativo", "Processada", tipo da origem, papel do próprio usuário |
| `outline` | só contorno | "Inativa", "Inativo", "Pendente", "Ignorada", "Criada automaticamente", "Já mesclada", "Sem resposta há X" (âmbar) |
| `destructive` | fundo vermelho, texto branco | "Opt-out", "Erro", "Sem sinal" |
| `default` | fundo quase preto | não usado |

Badge: 12px `font-medium`, padding 8px x 2px, cantos 8px, ícone de 12px quando houver.

### 3.10 Botões
| Variante | Visual | Usos típicos |
| --- | --- | --- |
| Primário (`default`) | fundo quase preto, texto branco | "Entrar", "Filtrar", "Aplicar", "Novo lead", "Nova origem", "Salvar lead", "Adicionar nota", "Criar origem", "Salvar origem", "Gerar link e QR", "Criar usuário", "Adicionar número", "Criar dispositivo e gerar token", "Reprocessar pendentes e erros", "Mesclar B em A", "Confirmar", "Mesclar" |
| Secundário (`outline`) | fundo branco com borda | "Limpar", "Limpar filtros", "Últimos 30 dias", "Sair", "Salvar nome", "Cancelar", "Buscar", "Desativar"/"Ativar", "Recalcular primeiro toque", "Reprocessar", "Reprocessar forçado", "Mesclar A em B", "Mesclar com outra pessoa", "Alterar", "Redefinir", "Salvar" (número), "Copiar", "Baixar QR Code (SVG)", "Gerar novo token", "Reativar", "Anterior"/"Próxima", Opt-out desligado |
| Terciário (`ghost`) | sem fundo nem borda | "Ignorar", "Descartar", recolher/expandir coluna, botão do menu no celular |
| Destrutivo (`destructive`) | fundo vermelho | só o botão de Opt-out quando ligado ("Ativado") |
| `secondary`, `link` | existem no componente | não usados |

Tamanhos: padrão 36px de altura; `sm` 32px (dentro de tabelas e ações secundárias); `icon` 36x36.
Desabilitado: 50% de opacidade.

Observação: ações destrutivas de fato (ignorar entrada, descartar conflito, mesclar, gerar novo token)
**não** usam a variante vermelha; usam outline/ghost/primário com confirmação.

### 3.11 Dialogs e confirmações
- **Dialog** (Radix/shadcn): overlay preto a 50%, caixa centralizada branca, até 512px de largura,
  cantos 10px, padding 24px, sombra grande, botão X no canto superior direito ("Fechar" para leitores de
  tela), animação de fade e zoom. Rodapé com botões alinhados à direita (empilhados no celular,
  primário por cima).
- Dialogs existentes: "Novo lead" (Leads), "Mover para {estágio}" (motivo da perda, Kanban e Pessoa),
  "Confirmar mescla" (Saúde).
- **Confirmações nativas do navegador** (`window.confirm`) em: mesclar pela ficha da Pessoa, Ignorar
  entrada, Reprocessar forçado, Descartar item da fila de revisão, Gerar novo token. Textos exatos nas
  seções de cada tela. No redesenho, podem virar dialogs no mesmo padrão.

### 3.12 Formulários
- Label acima do campo (14px `font-medium`), ajuda embaixo em 12px cinza quando existe.
- Grades responsivas: 1 coluna no celular, 2 a partir de 640px, 3 ou 4 a partir de 1024px.
- Selects são **nativos** do navegador (`NativeSelect`) com seta `ChevronDown` sobreposta.
- Campos de data usam o seletor nativo (`type="date"`); no screenshot aparece "mm/dd/yyyy" por causa do
  idioma do navegador de teste.
- Checkbox e radio nativos (origem "Ativa"; "Quem fica" na mescla).
- Filtros das telas de lista (Kanban, Leads, Painel, Saúde) são formulários GET: aplicar recarrega a
  página com os parâmetros na URL.
- Validação acontece no servidor; o erro volta como `MensagemAcao` vermelha e o formulário mantém o que
  foi digitado (exceto senhas).

## 4. Controle de acesso na UI
Fonte: `src/lib/papeis.ts`, `src/lib/sessao.ts`, `src/proxy.ts`, `src/lib/redirecionamento.ts`.

### 4.1 Papéis
`gestao` aparece como "Gestão" e `comercial` como "Comercial". Valor desconhecido vira Comercial (o de
menor acesso).

### 4.2 Quem vê o quê
| Tela | Rota | Gestão | Comercial |
| --- | --- | --- | --- |
| Login | `/login` | público | público |
| Início | `/` | sim | sim |
| Kanban | `/kanban` | sim | sim |
| Leads | `/leads` | sim | sim |
| Pessoa | `/pessoas/{id}` | sim, com card "Mesclar com outra pessoa" | sim, **sem** o card e sem o atalho "Mesclar" |
| Origens (lista, nova, detalhe) | `/origens`, `/origens/nova`, `/origens/{id}` | sim | não |
| Painel | `/painel` | sim | não |
| Saúde | `/saude` | sim | não |
| Usuários e números | `/usuarios` | sim | não |
| Dispositivos | `/dispositivos` | sim | não |

- O menu do Comercial mostra só **Início, Kanban e Leads**. O da Gestão mostra os 8 itens.
- O menu só esconde; quem bloqueia é o servidor.

### 4.3 Comercial tentando abrir tela de gestão
Redireciona para `/?erro=sem-permissao`. A tela Início mostra, abaixo do título, uma faixa vermelha clara:

> "Você não tem permissão para acessar aquela tela. Ela é exclusiva da gestão."

### 4.4 Sem sessão
- Qualquer tela interna sem cookie de sessão redireciona para `/login?next={caminho e query}`
  (sem `next` quando o destino era `/`).
- Depois de entrar, volta para o `next`, se for um caminho interno válido; senão vai para `/`.
- Quem já está logado e abre `/login` vai direto para `/`.
- Sessão inválida (cookie forjado ou expirado) também cai em `/login`.

## 5. Telas
### 5.1 Login

- **Objetivo:** entrar com e-mail e senha. Não há cadastro, "esqueci a senha" nem login social.
- **URL:** `/login` (título da aba "Entrar | Sistema de Leads Gestão Life").
- **Quem acessa:** qualquer pessoa sem sessão.
- **Layout:** sem menu. Fundo `muted` a 40% (cinza muito claro) ocupando a tela; card centralizado
  vertical e horizontalmente, largura máxima 384px, margem 16px.

Blocos (de cima para baixo):

1. Cabeçalho do card, centralizado: título "Sistema de Leads Gestão Life" (20px) e descrição
   "Entre com seu e-mail e senha.".
2. Formulário (16px entre campos):

| Campo | Tipo | Observações |
| --- | --- | --- |
| "E-mail" | e-mail | foco automático, autocomplete de e-mail; é enviado em minúsculas e sem espaços |
| "Senha" | senha | autocomplete de senha atual |

3. Mensagem de erro (vermelha, `alert`), quando houver.
4. Botão primário de largura total "Entrar" ("Entrando..." enquanto envia; campos e botão desabilitados).

Mensagens de erro:

| Situação | Texto |
| --- | --- |
| Credenciais erradas ou e-mail malformado | "E-mail ou senha inválidos" |
| Muitas tentativas | "Muitas tentativas. Aguarde um pouco e tente de novo." |
| Outra falha | "Não foi possível entrar agora. Tente de novo em instantes." |

Sucesso: vai para o destino (`next` ou `/`).

```
+------------------------------------------------------------+
|              +------------------------------+  (fundo      |
|              | Sistema de Leads Gestão Life |   cinza      |
|              | Entre com seu e-mail e senha.|   claro)     |
|              | E-mail [___________________] |              |
|              | Senha  [___________________] |              |
|              | E-mail ou senha inválidos    |  (vermelho)  |
|              | [          Entrar          ] |              |
|              +------------------------------+              |
+------------------------------------------------------------+
```

### 5.2 Início
- **Objetivo:** boas-vindas e local do aviso de permissão. Hoje o conteúdo é um card de status de
  desenvolvimento.
- **URL:** `/` (título da aba é o padrão "Sistema de Leads Gestão Life").
- **Quem acessa:** todos.

Blocos:

1. h1 "Bem-vindo, {nome do usuário}". Sem subtítulo.
2. Faixa vermelha "Você não tem permissão para acessar aquela tela. Ela é exclusiva da gestão."
   (só com `?erro=sem-permissao`).
3. Card "O que já funciona", com parágrafos em cinza (14px):
   - "Banco de dados com o schema completo, estágios iniciais e a origem desconhecida."
   - "Login com e-mail e senha, papéis Gestão e Comercial e proteção de todas as telas internas."
   - "Núcleo de ingestão (entradas idempotentes e resolução de identidade) e ingestão do WhatsApp pelo
     piolho, com dispositivos, usuários e números monitorados."
   - "Webhooks das LPs (Framer) e dos formulários da Meta."
   - "Telas de Leads (busca, filtros e novo lead), Kanban (arrastar entre estágios) e Pessoa (linha do
     tempo, notas, estágio e responsável)."
   - "Próximos passos: origens e atribuição, Painel e Saúde."

O texto está desatualizado (Origens, Painel e Saúde já existem). É o candidato natural a virar um
resumo útil no redesenho (ver seção 8).

```
+--------------------------------------------------+
| Bem-vindo, Gestão Teste                          |
| [! Você não tem permissão ... da gestão.     ]   |  (só com aviso)
| +- O que já funciona --------------------------+ |
| | Banco de dados com o schema completo, ...    | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

### 5.3 Kanban
- **Objetivo:** o funil do comercial. Cada coluna é um estágio; arrastar o cartão muda o estágio.
- **URL:** `/kanban?busca=&responsavel=` (aba "Kanban | Sistema de Leads Gestão Life").
- **Quem acessa:** todos. Usa a largura total.

Blocos:

1. **Cabeçalho:** h1 "Kanban"; subtítulo "Arraste o cartão para mudar o estágio. Cada mudança fica na
   linha do tempo com o seu usuário e a hora."
2. **Filtros** (linha única que quebra, alinhada pela base, 12px de espaço):

| Controle | Tipo | Detalhe |
| --- | --- | --- |
| "Busca" | texto, 256px | placeholder "Nome ou telefone" |
| "Responsável" | select, 208px | "Todos", "Sem responsável", depois os usuários em ordem alfabética |
| "Filtrar" | botão primário | aplica (GET) |
| "Limpar" | botão outline | só aparece com filtro ativo; volta para `/kanban` |

3. **Faixa de erro** (vermelha clara), acima do quadro, quando mover falha.
4. **Quadro:** colunas lado a lado com rolagem horizontal, 12px entre colunas, alinhadas pelo topo.
   Sem estágios cadastrados: "Nenhum estágio cadastrado.".

**Colunas** (na ordem dos estágios; estágios do seed):

| Ordem | Estágio | Tipo | Gatilho automático |
| --- | --- | --- | --- |
| 1 | Novo lead | aberto | (entrada da pessoa no funil) |
| 2 | Em conversa | aberto | primeira mensagem enviada após uma recebida |
| 3 | Qualificado | aberto | manual |
| 4 | Reunião agendada | aberto | evento reunião agendada |
| 5 | Ingresso comprado | aberto | evento ingresso comprado |
| 6 | Participou do evento | aberto | check-in no evento |
| 7 | Negociação | aberto | manual |
| 8 | Cliente Gestão PRO | ganho | venda registrada |
| 9 | Perdido | perdido | manual, com motivo |

Os nomes vêm do banco ("editáveis" segundo a especificação, mas não há tela para editá-los).

**Coluna aberta** (estágios do tipo aberto, e finais quando expandidos):
- 288px de largura, fundo `muted` a 40%, borda, cantos 10px, altura máxima da janela menos 14rem, com
  rolagem interna.
- Cabeçalho com borda inferior: nome do estágio (14px semibold, truncado) + badge secundário com o
  **total**. Colunas finais (ganho e perdido) têm à direita um botão ghost `ChevronLeft` "Recolher {nome}".
- Lista de cartões com 8px de espaço, altura mínima 96px.
- Vazia: "Nenhum lead" centralizado, 12px cinza.
- Rodapé quando o total passa do limite (200 por coluna, os mais recentes por último contato):
  "Mostrando os {n} mais recentes de {total}. Use a busca ou a tela Leads para ver os demais."

**Coluna recolhida:** as colunas **ganho e perdido começam recolhidas**. Ficam como uma faixa vertical de
56px: botão `ChevronRight` "Expandir {nome}", badge com o total e o nome do estágio escrito na vertical.
Continuam aceitando cartões soltos sobre elas. O estado expandido não é salvo (volta recolhido ao recarregar).

**Cartão** (fundo branco, borda, cantos 8px, padding 12px, `shadow-xs`, cursor de mão):

| Linha | Conteúdo | Regra |
| --- | --- | --- |
| Título | nome da pessoa, link para a ficha (14px `font-medium`, truncado) | sem nome: telefone formatado; sem telefone: e-mail; senão "Sem nome" |
| Telefone | ícone `Phone` + "+55 62 99999-9999" (12px cinza) | só se houver telefone |
| Origem | ícone `Signpost` + nome da origem do primeiro toque | sem origem: "Desconhecida" |
| Responsável | ícone `UserRound` + nome | sem responsável: "Sem responsável" |
| Badge | `Clock` + "Sem resposta há {tempo}" (contorno e texto âmbar) | só quando a pessoa mandou mensagem e ainda não teve resposta; tempo relativo ("há 2 h", "há 5 min", "agora há pouco") |

**Interações:**
- **Arrastar:** o cartão só começa a arrastar depois de mover 6px (clique no nome abre a ficha). Também
  funciona pelo teclado. Durante o arrasto, o cartão original fica a 40% de opacidade e uma cópia com
  sombra grande segue o ponteiro; a coluna sob o cartão ganha anel de foco.
- **Soltar em outra coluna:** o cartão vai para o **topo** da coluna de destino na hora e os totais se
  ajustam. Se o servidor recusar, volta para o lugar e aparece a faixa de erro (mensagem do servidor, ou
  "Não foi possível mover o lead.", ou "Não foi possível mover o lead. Verifique a conexão e tente de novo.").
- **Soltar em coluna do tipo perdido:** abre o dialog **"Mover para {nome do estágio}"** (ver 5.3.1)
  antes de mover. Cancelar não move nada.
- Soltar na mesma coluna não faz nada.
- Cada mudança grava um evento na linha do tempo com usuário e hora.

#### 5.3.1 Dialog de motivo da perda (`components/app/dialogo-motivo-perda.tsx`)
Usado no Kanban e no seletor de estágio da Pessoa.

| Elemento | Texto |
| --- | --- |
| Título | "Mover para {estágio}" |
| Descrição | "Informe o motivo da perda de {pessoa}. Ele fica gravado na pessoa e na linha do tempo." (sem pessoa: "Informe o motivo da perda. Ele fica gravado na pessoa e na linha do tempo.") |
| Campo | "Motivo da perda", área de texto, obrigatório, até 500 caracteres, foco automático, placeholder "Ex.: achou caro, comprou de outro, não respondeu mais" |
| Botões | "Cancelar" (outline) e "Confirmar" (primário, **desabilitado enquanto o motivo estiver vazio**) |

Regra: **Perdido exige motivo** (o servidor também recusa com "Informe o motivo da perda").

```
+------------------------------------------------------------------------------+
| Kanban                                                                       |
| Arraste o cartão para mudar o estágio. Cada mudança fica na linha do tempo...|
| Busca [Nome ou telefone ]  Responsável [Todos v]  [Filtrar] [Limpar]         |
| +- Novo lead (0) -+ +- Em conversa (0)+ +- Qualificado (1)+   +--+ +--+      |
| |   Nenhum lead   | |   Nenhum lead   | | Maria E2E       |...|> | |> |      |
| |                 | |                 | | tel +55 62 ...  |   |8 | |3 |      |
| |                 | |                 | | org Desconhecida|   |Cl| |Pe|      |
| |                 | |                 | | usr Sem respons.|   |ie| |rd|      |
| |                 | |                 | | (Sem resp. há 2h|   |nt| |id|      |
| +-----------------+ +-----------------+ +-----------------+   +--+ +--+      |
|  <---- rolagem horizontal ---->            colunas finais recolhidas (56px)  |
+------------------------------------------------------------------------------+
```

### 5.4 Leads
- **Objetivo:** lista de todas as pessoas com busca, filtros e cadastro manual.
- **URL:** `/leads?busca=&origem=&cidade=&estagio=&responsavel=&de=&ate=&pagina=` (aba "Leads | ...").
- **Quem acessa:** todos. Largura total.

Blocos:

1. **Cabeçalho em linha:** h1 "Leads", subtítulo "Todas as pessoas, do último contato mais recente para o
   mais antigo."; à direita botão primário `Plus` "Novo lead".
2. **Card de filtros** (grade: 1 coluna, 2 a partir de 640px, 4 a partir de 1024px):

| Campo | Tipo | Detalhe |
| --- | --- | --- |
| "Busca" | texto (ocupa 2 colunas) | placeholder "Nome, telefone ou e-mail" |
| "Origem" | select | "Todas" + origens em ordem alfabética |
| "Cidade" | texto | sem placeholder |
| "Estágio" | select | "Todos" + estágios na ordem do funil |
| "Responsável" | select | "Todos", "Sem responsável", usuários |
| "Primeiro contato de" | data | |
| "até" | data | inclui o dia inteiro |
| "Filtrar" | botão primário | linha própria embaixo |
| "Limpar filtros" | botão outline | só com filtro ativo |

Valores inválidos na URL são ignorados em silêncio.

3. **Card de resultados:**
   - Linha de status (14px cinza): "{início} a {fim} de {total} leads" (singular "lead"), ou
     "Nenhum lead encontrado." (nesse caso não há tabela).
   - Tabela (50 por página):

| Coluna | Conteúdo | Vazio |
| --- | --- | --- |
| Nome | link para a ficha, `font-medium` | "Sem nome" |
| Telefone | "+55 62 99999-9999" | vazio |
| E-mail | e-mail | vazio |
| Estágio | nome | "Sem estágio" |
| Origem | origem do primeiro toque | "Desconhecida" |
| Cidade | cidade | vazio |
| Responsável | nome | vazio |
| Primeiro contato | "02/10/2026" (cinza) | vazio |
| Último contato | "02/10/2026, 18:50" (cinza) | vazio |

   - Paginação (só com mais de uma página): "Anterior" à esquerda, "Página {n} de {total}" no centro,
     "Próxima" à direita (botões outline pequenos; somem na primeira e na última página).

**Dialog "Novo lead"** (botão no cabeçalho; abre sempre limpo):

| Elemento | Texto / detalhe |
| --- | --- |
| Título | "Novo lead" |
| Descrição | "O lead entra pelo mesmo caminho das outras fontes e cai no estágio Novo lead." |
| "Nome" | texto, até 120 |
| "Telefone" | teclado de telefone, placeholder "Ex.: 62 99999-8888" |
| "E-mail" | e-mail |
| "Nota (opcional)" | área de texto, até 2000 |
| Ajuda | "Informe pelo menos o telefone ou o e-mail." (12px cinza) |
| Botão | "Salvar lead" ("Salvando...") + mensagem ao lado |
| Link após sucesso | "Abrir a ficha" |

Mensagens:

| Situação | Texto |
| --- | --- |
| Sucesso | "Lead salvo. Se o telefone ou o e-mail já existiam, ele foi vinculado à mesma pessoa." |
| Sem telefone e sem e-mail | "Informe o telefone ou o e-mail" |
| Telefone inválido | "Telefone inválido. Use DDD e número, ex.: 62 99999-8888" |
| E-mail inválido | "E-mail inválido" |
| Limites | "Nome longo demais", "Telefone longo demais", "E-mail longo demais", "A nota deve ter no máximo 2000 caracteres" |
| Gravou mas falhou ao processar | "O lead foi registrado, mas o processamento falhou ({erro}). A entrada fica para reprocessamento." |

O dialog não fecha sozinho depois de salvar.

```
+------------------------------------------------------------------------------+
| Leads                                                       [+ Novo lead]    |
| Todas as pessoas, do último contato mais recente para o mais antigo.        |
| +- Filtros ----------------------------------------------------------------+ |
| | Busca [Nome, telefone ou e-mail    ]  Origem [Todas v]  Cidade [      ]  | |
| | Estágio [v] Responsável [v] Primeiro contato de [data] até [data]        | |
| | [Filtrar] [Limpar filtros]                                               | |
| +--------------------------------------------------------------------------+ |
| +- Resultados -------------------------------------------------------------+ |
| | 1 a 2 de 2 leads                                                         | |
| | Nome  Telefone  E-mail  Estágio  Origem  Cidade  Resp.  1º cont. Últ.    | |
| | [Anterior]            Página 1 de 3                         [Próxima]    | |
| +--------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------+
```

### 5.5 Pessoa (ficha do lead)
- **Objetivo:** tudo sobre uma pessoa: dados editáveis, linha do tempo, identificadores e mescla.
- **URL:** `/pessoas/{id}` (aba "Pessoa | ..."). Id inválido ou inexistente: 404. Pessoa já mesclada:
  redireciona para a ficha da que ficou.
- **Quem acessa:** todos; o card de mescla e o atalho "Mesclar" só para a Gestão. Largura limitada a 1024px.

Blocos:

1. **Cabeçalho:**
   - Link "Voltar para Leads" (sempre aponta para Leads, mesmo vindo do Kanban ou do Painel).
   - Linha: h1 com o nome (sem nome: telefone formatado; senão "Sem nome") + badge secundário com o
     estágio + badge vermelho "Opt-out" quando ligado.
   - Linha de toques (14px): "**Primeiro toque:** {origem} ({data e hora})" e
     "**Último toque:** {origem} ({data e hora})"; sem toque: "sem origem". Rótulo em `font-medium`,
     valor em cinza.
   - Atalhos de seção (âncoras, 14px, sublinham no hover): "Dados", "Linha do tempo",
     "Identificadores" e, só Gestão, "Mesclar".

2. **Card "Dados"** (descrição: "Mudanças de estágio, responsável e opt-out ficam na linha do tempo com o
   seu usuário."):
   - Linha do nome: label "Nome", campo (até 384px, placeholder "Sem nome", até 120) + botão outline pequeno
     "Salvar nome"; mensagem 12px embaixo.
   - Grade (1, 2 ou 3 colunas):

| Controle | Comportamento |
| --- | --- |
| "Estágio" (select 240px) | salva **ao mudar**, sem botão. Se não há estágio, aparece a opção "Sem estágio". Escolher um estágio do tipo perdido abre o dialog do motivo da perda. Desabilitado enquanto salva; em erro volta ao valor anterior |
| "Responsável" (select 240px) | salva ao mudar. Opções: "Sem responsável" + usuários |
| "Opt-out" | botão-chave: desligado = outline "Desativado" + "Pode receber contato."; ligado = vermelho "Ativado" + "A pessoa pediu para não receber contato." |
| "Primeiro contato" | texto "02/10/2026, 18:50" ou "Nunca" |
| "Último contato" | idem |
| "Motivo da perda" | só quando o estágio atual é do tipo perdido e há motivo |

Mensagens (12px, embaixo de cada controle):

| Ação | Sucesso | Sem mudança | Erros possíveis |
| --- | --- | --- | --- |
| Nome | "Nome salvo." | "Nada mudou." | "Use no máximo 120 caracteres" |
| Estágio | "Estágio alterado." | "A pessoa já estava neste estágio." | "Informe o motivo da perda", "Estágio não encontrado" |
| Responsável | "Responsável alterado." | "Nada mudou." | "Usuário não encontrado" |
| Opt-out | "Opt-out ativado." / "Opt-out desativado." | "Nada mudou." | |
| Qualquer uma, em pessoa mesclada | | | "Esta pessoa foi mesclada com outra; abra a ficha da sobrevivente" |

3. **Card "Linha do tempo"** (descrição: "Eventos e mensagens do WhatsApp agregadas por dia, do mais
   recente para o mais antigo. O conteúdo das conversas não é guardado."):
   - Formulário de nota: label "Nova nota", área de texto obrigatória (até 2000, placeholder
     "Ex.: pediu retorno na segunda à tarde"), botão primário "Adicionar nota" ("Salvando...") e mensagem
     ("Nota adicionada." ou "Escreva a nota").
   - Aviso de truncamento (caixa cinza, 12px): "Mostrando os 500 itens mais recentes. Os mais antigos não
     aparecem aqui."
   - Vazio: "Nada registrado ainda."
   - Lista ordenada, 20px entre itens. Dois tipos de item:

   **Item de evento** (ícone `StickyNote` cinza à esquerda):
   - Título 14px `font-medium` (frases na seção 6.3).
   - Linha 12px cinza: "{data e hora} por {usuário}" (o "por" só em ações manuais).
   - Linhas de detalhe 14px (ex.: "Origem: ...", "Motivo da perda: ...", texto da nota).
   - "**Texto de abertura:** {texto}" em 12px cinza, quando o evento traz o texto de abertura do WhatsApp.

   **Item de mensagens do dia** (ícone `MessageSquare` cinza):
   - Título: "Mensagens em {dia} " + em cinza "no número {número monitorado}". Ex.:
     "Mensagens em sex., 02/10/2026 no número +55 62 90000-0813".
   - Resumo 14px: "3 recebidas, 2 enviadas, 1ª resposta em 4 min" (ou "..., sem resposta").
   - Uma linha "**Texto de abertura:** {texto}" (12px cinza) para cada texto de abertura do dia.
   - Um item por dia e por número monitorado.

4. **Card "Identificadores"** (descrição: "Valor normalizado (usado nas buscas) e como chegou
   originalmente."). Vazio: "Nenhum identificador." Tabela:

| Coluna | Conteúdo |
| --- | --- |
| Tipo | "Telefone", "E-mail", "WhatsApp (wa_id)" ou "Lead da Meta" |
| Valor | normalizado (telefone formatado "+55 62 98133-3397") |
| Valor original | como chegou (cinza), ex.: "62 98133-3397" |
| Desde | data e hora (cinza) |

5. **Card "Mesclar com outra pessoa"** (só Gestão). Descrição: "Use quando a mesma pessoa foi cadastrada
   duas vezes. Identificadores, eventos e mensagens da absorvida passam para a que fica; nada é apagado e
   a linha do tempo registra a mescla."

| Elemento | Detalhe |
| --- | --- |
| "Outra pessoa (id, telefone ou e-mail)" | texto obrigatório, até 448px, placeholder "Ex.: 62 99999-9999 ou maria@exemplo.com" |
| "Quem fica" (radios) | "Esta pessoa (a outra é absorvida)" (padrão) / "A outra pessoa (esta é absorvida)" |
| Botão | outline "Mesclar com outra pessoa" ("Mesclando...") |
| Confirmação nativa | "Mesclar? ESTA pessoa fica e a outra é absorvida: identificadores, eventos e mensagens passam para a que fica. Nada é apagado, mas a mescla não se desfaz pela tela." (com "a OUTRA pessoa fica e esta" quando escolhida a outra) |
| Sucesso | "Pessoas mescladas: {n} identificadores, {n} eventos e {n} mensagens movidos." + link "Abrir a pessoa que ficou" |
| Erros | "Nenhuma pessoa encontrada com esse id, telefone ou e-mail", "Essa referência é desta mesma pessoa", "Informe o id, o telefone ou o e-mail da outra pessoa", "Não é possível mesclar uma pessoa com ela mesma" |
| Avisos anexados | "A pessoa escolhida para ficar já tinha sido mesclada; a mescla foi feita na sobrevivente dela.", "A pessoa a absorver já tinha sido mesclada; foi usada a sobrevivente dela.", "As duas pessoas já eram a mesma (mescladas antes); nada foi movido." (este com "Nada a mesclar.") |

```
+----------------------------------------------------------------+
| Voltar para Leads                                              |
| Maria E2E 813397  (Qualificado) (Opt-out)                      |
| Primeiro toque: Gestão na Veia (02/10/2026, 17:42)  Último ... |
| Dados  Linha do tempo  Identificadores  Mesclar                |
| +- Dados ----------------------------------------------------+ |
| | Nome [Maria E2E 813397          ] [Salvar nome]            | |
| | Estágio [Qualificado v]  Responsável [Comercial v]         | |
| | Opt-out [Desativado] Pode receber contato.                 | |
| | Primeiro contato  Último contato  Motivo da perda (perdido)| |
| +------------------------------------------------------------+ |
| +- Linha do tempo -------------------------------------------+ |
| | Nova nota [Ex.: pediu retorno na segunda à tarde       ]   | |
| | [Adicionar nota]                                           | |
| | [nota] Responsável alterado de ninguém para Comercial T.   | |
| |        02/10/2026, 18:50 por Gestão Teste                  | |
| | [msg]  Mensagens em sex., 02/10/2026 no número +55 62 ...  | |
| |        3 recebidas, 2 enviadas, 1ª resposta em 4 min       | |
| |        Texto de abertura: Olá! Quero saber do Gestão ...   | |
| +------------------------------------------------------------+ |
| +- Identificadores (Tipo, Valor, Valor original, Desde) -----+ |
| +- Mesclar com outra pessoa (só gestão) ---------------------+ |
| | [id, telefone ou e-mail] (o) Esta pessoa ( ) A outra       | |
| | [Mesclar com outra pessoa]                                 | |
| +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

### 5.6 Origens
Tipos de origem (rótulos usados em todas as telas):

| Código | Rótulo |
| --- | --- |
| `anuncio_ctwa` | "Anúncio de clique para WhatsApp" |
| `link_whatsapp` | "Link do WhatsApp" |
| `qr_code` | "QR Code" |
| `form_meta` | "Formulário da Meta" |
| `lp` | "Landing page" |
| `organico` | "Orgânico" |
| `indicacao` | "Indicação" |
| `desconhecida` | "Desconhecida" |

Origens criadas sozinhas pelo sistema (badge "Criada automaticamente"): "Anúncio não cadastrado {id}" e
"Formulário não cadastrado {id}". A origem padrão do WhatsApp é "WhatsApp direto (desconhecida)", código
`desconhecida` (o código não pode ser mudado).

#### 5.6.1 Lista de origens
- **URL:** `/origens` (aba "Origens | ..."). **Quem acessa:** Gestão. Largura total.

Blocos:

1. **Cabeçalho em linha:** h1 "Origens", subtítulo "De onde vem cada lead: anúncios, links e QR Codes do
   WhatsApp, formulários da Meta e LPs."; à direita botão primário `Plus` "Nova origem".
2. **Card "Origens cadastradas"**. Descrição: "Leads = pessoas cujo primeiro toque veio desta origem.
   Toques = todos os contatos (conversas e formulários) atribuídos a ela." e, se houver automáticas ativas,
   " Há {n} origem(ns) criada(s) automaticamente: abra e complete o cadastro."
   Vazio: "Nenhuma origem cadastrada." Ordem: ativas primeiro, depois por nome. Tabela (13 colunas, rola
   na horizontal):

| Coluna | Conteúdo |
| --- | --- |
| Código | monoespaçado 12px, link para o detalhe |
| Nome | `font-medium`, link para o detalhe |
| Tipo | rótulo do tipo (12px) |
| Leads | número, à direita |
| Toques | número, à direita |
| Situação | badge "Ativa" (secondary) ou "Inativa" (outline) e, embaixo, botão outline pequeno "Desativar"/"Ativar" |
| Padrão de texto | texto normalizado (12px) ou "-" |
| Meta | linhas "anúncio {id}" e "form {id}" ou "-" |
| UTMs | linhas "source: ...", "medium: ...", "campaign: ..." ou "-" |
| Cidade | ou "-" |
| Evento | ou "-" |
| Produto | ou "-" |
| Automática | "Sim" ou "Não" |

   Linhas inativas ficam em cinza. Mensagens do botão: "Origem ativada.", "Origem desativada.",
   "Origem não encontrada".
3. **Card "Primeiro toque"**. Descrição: "A origem de cada toque é definida quando a entrada é processada e
   o evento nunca muda. Este botão recalcula só o primeiro toque guardado em cada pessoa a partir dos
   eventos. Para atribuir uma origem nova a toques antigos, as entradas precisam ser reprocessadas (botão
   previsto na tela Saúde)." Botão outline "Recalcular primeiro toque" ("Recalculando...").
   Sucesso: "Primeiro toque recalculado: 1 pessoa atualizada." / "Primeiro toque recalculado: {n} pessoas
   atualizadas." (O texto "botão previsto" está desatualizado: o reprocessamento já existe na Saúde.)

```
+------------------------------------------------------------------------------+
| Origens                                                     [+ Nova origem]  |
| De onde vem cada lead: anúncios, links e QR Codes do WhatsApp, ...           |
| +--------------------------------------------------------------------------+ |
| | Origens cadastradas                                                      | |
| | Leads = pessoas cujo primeiro toque... Há 1 origem(ns) criada(s) ...     | |
| | Código       Nome          Tipo     Leads Toques Situação   Padrão  Meta.| |
| | gnv-maceio.. Gestão na V.. Link do.   1     1   (Ativa)    ola!..  -    | |
| |                                                 [Desativar]              | |
| | desconhecida WhatsApp d..  Descon.    1     1   (Ativa) ...              | |
| +--------------------------------------------------------------------------+ |
| +--------------------------------------------------------------------------+ |
| | Primeiro toque                                                           | |
| | A origem de cada toque é definida quando ...                             | |
| | [Recalcular primeiro toque]                                              | |
| +--------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------+
```

#### 5.6.2 Nova origem
- **URL:** `/origens/nova` (aba "Nova origem | ..."). Gestão. Largura 1024px.

Blocos:

1. Link "Voltar para Origens"; h1 "Nova origem".
2. Card "Dados da origem", descrição "Depois de criar, a página da origem gera o link do WhatsApp e o QR
   Code com o texto pré-preenchido." com o formulário de origem (abaixo). Botão "Criar origem".
3. Ao criar, vai direto para o detalhe da origem, já com o texto digitado pré-preenchido no gerador do link.

**Formulário de origem** (mesmo na criação e na edição):

| Grupo | Campo | Tipo | Ajuda / placeholder |
| --- | --- | --- | --- |
| Linha 1 (3 colunas) | "Código" | texto, obrigatório, até 80 | placeholder "ex.: gnv-maceio-2026"; ajuda "Único, minúsculo e sem espaços. É o valor do campo oculto origem das LPs." |
| | "Nome" | texto, obrigatório, até 120 | placeholder "ex.: Gestão na Veia Maceió (link)" |
| | "Tipo" | select | os 8 tipos; padrão "Link do WhatsApp" |
| Linha inteira | "Texto pré-preenchido (WhatsApp)" | área de texto, 2 linhas, até 300 | placeholder "ex.: Olá! Quero saber do Gestão na Veia Maceió"; na edição mostra "Padrão gravado (normalizado): {padrão em mono}"; ajuda "Digite como a pessoa vai enviar, com acentos. O sistema grava a forma normalizada (minúsculo, sem acento, sem emoji e com espaços colapsados) e atribui a esta origem as conversas cuja primeira mensagem é igual ao texto ou começa com ele." |
| Grupo "Meta (anúncios e formulários)" (4 colunas) | "Id do anúncio", "Id do formulário", "Id do conjunto", "Id da campanha" | numéricos | |
| Grupo "UTMs das LPs (campo vazio vale para qualquer valor; preencha source ou campaign)" (3 colunas) | "utm_source", "utm_medium", "utm_campaign" | texto | |
| Linha (3 colunas) | "Cidade", "Evento", "Produto" | texto | |
| Linha | checkbox "Ativa (origens inativas não recebem atribuições novas)" | marcado por padrão | |
| Ações | "Criar origem" / "Salvar origem" ("Salvando...") + mensagem | | |

Mensagens:

| Situação | Texto |
| --- | --- |
| Salvo (edição) | "Origem salva." ou "Origem salva. Padrão de texto gravado: \"{padrão}\"." |
| Código repetido | "Já existe uma origem com o código \"{código}\"" |
| Código inválido | "Código: só letras minúsculas sem acento, números, hífen ou sublinhado, sem espaços (ex.: gnv-maceio-2026)" |
| Obrigatórios | "Informe o código", "Informe o nome", "Escolha um tipo válido" |
| Ids da Meta | "{Campanha da Meta / Conjunto de anúncios da Meta / Anúncio da Meta / Formulário da Meta}: use só números" |
| Origem desconhecida | "O código \"desconhecida\" não pode ser alterado: é a origem padrão do WhatsApp" |
| Limites | "Código longo demais (máximo 80)", "Nome longo demais (máximo 120)", "Texto pré-preenchido: no máximo 300 caracteres", "Use no máximo {n} caracteres" |

#### 5.6.3 Detalhe da origem (com link e QR)
- **URL:** `/origens/{id}` (aba "Origem | ..."). Gestão. Largura 1024px. Id inválido: 404.

Blocos:

1. **Cabeçalho:**
   - Link "Voltar para Origens".
   - h1 com o nome + badge secondary com o tipo + badge outline "Inativa" (se inativa) + badge outline
     "Criada automaticamente" (se automática).
   - Linha de metadados em cinza 14px: código (mono), "{n} lead(s) no primeiro toque", "{n} toque(s)",
     "Criada em {data e hora}" e o botão outline pequeno "Desativar"/"Ativar".
2. **Card "Link do WhatsApp e QR Code"** (só para os tipos "Link do WhatsApp" e "QR Code"). Descrição:
   "Escolha o número e gere o link com o texto pré-preenchido. Nada é gravado: gere de novo quando quiser
   outro número."
   - Sem números cadastrados: "Nenhum número cadastrado. Adicione um em Usuários e números."
   - Formulário (2 colunas):

| Campo | Detalhe |
| --- | --- |
| "Número de destino" | select com os números monitorados: "{apelido} (+55 62 98888-7777)" ou só o telefone |
| "Texto da mensagem" | área de texto, 2 linhas, até 300; começa com o texto digitado na criação ou o padrão; ajuda "Pode ter acentos e emoji, mas precisa começar com o padrão da origem." |
| Botão | primário "Gerar link e QR" ("Gerando...") + mensagem ("Link e QR Code gerados.") |

   - Resultado (depois de gerar), em duas colunas:
     - Esquerda: label "Link", campo somente leitura em mono com `https://wa.me/{número}?text={texto}`, e
       embaixo o link "Abrir no WhatsApp" (nova aba).
     - Direita: **QR Code** 192x192px, fundo branco, borda, cantos 8px; embaixo botão outline pequeno
       `Download` "Baixar QR Code (SVG)" (arquivo `qr-{código}.svg`).
   - Erros: "O texto precisa começar com o padrão desta origem (\"{padrão}\"), senão a conversa não será
     atribuída", "Cadastre o texto pré-preenchido da origem primeiro", "Escolha o número de destino",
     "Número não cadastrado", "Origem não encontrada", "Texto: no máximo 300 caracteres".
3. **Card "Dados da origem"**. Descrição: "Mudanças valem para os próximos toques. Toques já gravados
   mantêm a origem que receberam." Formulário de origem preenchido, botão "Salvar origem".

```
+----------------------------------------------------------------+
| Voltar para Origens                                            |
| Gestão na Veia Maceió E2E 155697 (Link do WhatsApp)            |
| gnv-maceio-e2e-155697  0 lead(s) no primeiro toque  0 toque(s) |
| Criada em 02/10/2026, 19:12  [Desativar]                       |
| +- Link do WhatsApp e QR Code -------------------------------+ |
| | Número de destino            Texto da mensagem             | |
| | [Central E2E (+55 62 ...) v] [ola! quero saber do ...   ]  | |
| | [Gerar link e QR]  Link e QR Code gerados.                 | |
| | Link                                        +----------+   | |
| | [https://wa.me/5562988887777?text=ola...]   | QR 192px |   | |
| | Abrir no WhatsApp                           +----------+   | |
| |                                     [Baixar QR Code (SVG)] | |
| +------------------------------------------------------------+ |
| +- Dados da origem ------------------------------------------+ |
| | [Código] [Nome] [Tipo v]                                   | |
| | Texto pré-preenchido (WhatsApp) [......................]   | |
| | Meta: [anúncio] [formulário] [conjunto] [campanha]         | |
| | UTMs: [utm_source] [utm_medium] [utm_campaign]             | |
| | [Cidade] [Evento] [Produto]   [x] Ativa (...)              | |
| | [Salvar origem]                                            | |
| +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

### 5.7 Painel
- **Objetivo:** visão gerencial dos leads de um período.
- **URL:** `/painel?de=&ate=&cidade=&origem=` (aba "Painel | ..."). Gestão. Largura total.
- **Regra do período:** padrão = últimos 30 dias com hoje incluído; máximo 366 dias; se "De" vier depois
  de "Até", as datas são trocadas. "Leads do período" = pessoas cujo primeiro contato caiu no período
  (horário de Brasília); pessoas mescladas não contam.

Blocos (de cima para baixo):

1. **Cabeçalho:** h1 "Painel"; subtítulo "Leads do período são as pessoas cujo primeiro contato caiu entre
   as datas escolhidas (horário de Brasília). Pessoas mescladas não contam."
2. **Card de filtros** (grade de até 5 colunas):

| Controle | Tipo | Detalhe |
| --- | --- | --- |
| "De" | data | |
| "Até" | data | |
| "Cidade" | texto com sugestões (datalist com as cidades do período) | placeholder "Todas" |
| "Origem (1º toque)" | select | "Todas" + origens |
| "Aplicar" | botão primário | |
| "Últimos 30 dias" | botão outline | volta ao padrão |

   Embaixo, linha de status: "{n} leads em {d} dias." (singular "lead"/"dia"), com " (com filtro)" quando
   há cidade ou origem.
3. **Linha com 2 cards** (lado a lado a partir de 1280px):
   - **"Leads por origem"** ("Origem do primeiro toque de cada lead do período."): barras horizontais, rótulo
     à esquerda (cortado em 22 caracteres com reticências), valor "{n} ({%})" na ponta da barra. Embaixo,
     "Ver tabela" recolhível (Origem, Leads, % do total).
   - **"Leads por cidade"** ("Cidade do primeiro formulário com cidade; sem formulário, a cidade da
     origem."): barras horizontais; sem cidade aparece "Sem cidade". "Ver tabela" (Cidade, Leads).
4. **Card "Leads por dia"** ("Dia do primeiro contato (horário de Brasília)."): colunas verticais com eixo Y
   de valores redondos e grade discreta; rótulo do eixo X "dd/mm" (no máximo 12 rótulos). "Ver tabela"
   (Dia "sex., 02/10/2026", Leads).
5. **Linha com 2 cards:**
   - **"Primeiro x último toque"** ("Quantos leads do período têm cada origem como primeiro toque e como
     último toque (o último antes da venda, se houver)."): tabela Origem, Como 1º toque, Como último toque.
     Vazio: "Nenhum toque com origem no período."
   - **"Conversão por estágio"** ("Quantos leads do período passaram por cada estágio (percentual sobre o
     total) e quantos estão nele hoje."): barras horizontais (escala = total de leads) com "{n} ({%})" e,
     embaixo, tabela sempre visível: Estágio, Passaram, % do total, Estão hoje.
6. **Card "Tempo de primeira resposta por número"** ("Em cada conversa, o tempo entre a primeira mensagem
   recebida e a primeira enviada depois dela. Entram as conversas cuja primeira mensagem recebida caiu no
   período."): tabela Número (telefone + apelido em cinza entre parênteses), Conversas, Respondidas, Média,
   Mediana ("7 min", "1 h 15 min"; "-" sem dado), Sem resposta. Vazio: "Nenhuma conversa iniciada no período."
7. **Card "Leads sem resposta"** ("Situação de agora (não depende do período): quem mandou mensagem e ainda
   não teve resposta, de quem espera há mais tempo. Até 50."): tabela Pessoa (link; "Sem nome"), Telefone,
   Estágio ("Sem estágio"), Esperando há ("1 h 1 min", "31 min", "2 dias"). Vazio: "Ninguém esperando resposta."

Estado vazio padrão dos gráficos: "Nenhum lead no período."

**Gráficos** (`components/app/graficos.tsx`): SVG feito à mão, sem biblioteca. Uma série só, na cor
`--grafico-serie` (azul #2a78d6). Barras finas (16px nas horizontais, até 24px nas colunas) com a ponta
arredondada em 4px e a base reta. Texto sempre nas cores de texto (rótulos em `foreground`, valores em
`muted-foreground`, 11 a 12px), nunca na cor da série. Linha de base cinza. Passar o mouse destaca a linha
inteira com fundo `muted` e mostra uma dica nativa "{rótulo}: {valor}". As barras horizontais foram
pensadas para meio card (até 440px) e as colunas para um card inteiro (até 920px); não crescem além disso.

```
+------------------------------------------------------------------------------+
| Painel                                                                       |
| +- Filtros ----------------------------------------------------------------+ |
| | De [09/03/2026] Até [10/02/2026] Cidade [Todas] Origem [Todas v]          | |
| | [Aplicar] [Últimos 30 dias]        4 leads em 30 dias.                    | |
| +--------------------------------------------------------------------------+ |
| +- Leads por origem ----------------+ +- Leads por cidade -----------------+ |
| | WhatsApp direto |=========| 3(75%)| | Sem cidade |============| 4      | |
| | > Ver tabela                      | | > Ver tabela                       | |
| +-----------------------------------+ +------------------------------------+ |
| +- Leads por dia (colunas, eixo Y redondo, eixo X dd/mm) ------------------+ |
| | 4 |                                                          #           | |
| | 0 +----------------------------------------------------------#---------- | |
| +--------------------------------------------------------------------------+ |
| +- Primeiro x último toque ---------+ +- Conversão por estágio ------------+ |
| | Origem  Como 1º  Como último      | | Novo lead |==========| 4 (100%)    | |
| |                                   | | tabela: Passaram, %, Estão hoje    | |
| +-----------------------------------+ +------------------------------------+ |
| +- Tempo de primeira resposta por número (tabela) -------------------------+ |
| +- Leads sem resposta (tabela, até 50) ------------------------------------+ |
+------------------------------------------------------------------------------+
```

### 5.8 Saúde
- **Objetivo:** monitorar o piolho, as entradas com problema e os conflitos de identidade.
- **URL:** `/saude?chave=` (aba "Saúde | ..."). Gestão. Largura total. Âncoras dos cards: `#dispositivos`,
  `#entradas`, `#busca-entrada`, `#revisao`.

Blocos:

1. **Cabeçalho:** h1 "Saúde"; subtítulo "Dispositivos do piolho, entradas que falharam no processamento e
   conflitos de identidade esperando decisão."

2. **Card "Dispositivos"**. Descrição: "Alerta quando o último sinal tem mais de 15 min em horário comercial
   (segunda a sexta, 8h às 19h). Agora é horário comercial." (ou "Agora não é horário comercial.") seguida
   do link sublinhado "Gerenciar dispositivos" (vai para `/dispositivos`).
   - Alerta vermelho (só se houver): "1 dispositivo sem sinal." / "{n} dispositivos sem sinal."
   - Vazio: "Nenhum dispositivo cadastrado."
   - Tabela (ativos primeiro, depois por nome; inativos em cinza):

| Coluna | Conteúdo |
| --- | --- |
| Nome | `font-medium` |
| Usuário | nome ou "-" |
| Número | número detectado formatado ou "-" |
| Último sinal | tempo relativo ("há 40 min", "agora há pouco", "Nunca") + badge vermelho **"Sem sinal"** quando em alerta; passar o mouse mostra a data e hora |
| Fila pendente | número, à direita |
| Versão | versão da extensão ou "-" |
| Situação | badge "Ativo" (secondary) ou "Inativo" (outline) |

   **Regra do alerta "Sem sinal":** dispositivo ativo, agora é horário comercial (seg a sex, 8h às 19h,
   Brasília) e o último sinal tem mais de 15 min (ou nunca chegou). Fora do horário comercial nunca há alerta.

3. **Card "Entradas com erro ou pendentes"**. Descrição: "{n} com erro e {n} pendentes. Mostrando as 100
   mais recentes. O reprocessamento automático tenta cada uma até 10 vezes."
   - Botão primário "Reprocessar pendentes e erros" ("Reprocessando..."). Resultado ao lado:
     "Total: {n} · processadas: {n} · com erro: {n}".
   - Mensagem da última ação de linha (acima da tabela): "{fonte} {chave}: {mensagem}".
   - Vazio: "Nenhuma entrada com erro ou pendente."
   - Tabela:

| Coluna | Conteúdo |
| --- | --- |
| Fonte | valor cru: "whatsapp", "meta_lead", "framer", "hotmart", "manual" ou "outra" |
| Chave | mono 12px, quebra em qualquer ponto |
| Recebida em | data e hora (cinza) |
| Tentativas | número, à direita |
| Erro | texto; acima de 80 caracteres mostra os 80 primeiros com reticências e clicar expande o texto inteiro; sem erro "-" |
| Status | badge: "Erro" (vermelho), "Pendente" (outline), "Processada" (secondary), "Ignorada" (outline) |
| Ações | "Reprocessar" (outline pequeno) e "Ignorar" (ghost pequeno) + mensagem 12px |

   - "Ignorar" pede confirmação: "Ignorar esta entrada? Ela sai da fila de reprocessamento (nada é apagado)."
   - Mensagens: "Entrada processada com sucesso.", "Entrada já estava processada ou ignorada (sem efeito).",
     "Entrada não encontrada.", "Continua com erro: {erro}", "Entrada ignorada.", "Só entradas com erro ou
     pendentes podem ser ignoradas". A linha some da lista quando resolvida (na próxima atualização).

4. **Card "Reprocessar uma entrada já processada"**. Descrição: "Busque pela chave de idempotência (ex.: o
   leadgen_id da Meta ou numero:wa_msg_id do WhatsApp). O reprocessamento forçado serve para reatribuir a
   origem depois de cadastrar uma origem nova."
   - Campo "Chave de idempotência" (320px) + botão outline "Buscar".
   - Sem resultado: "Nenhuma entrada com essa chave."
   - Tabela: Fonte, Chave, Recebida em, Processada em ("-"), Tentativas, Status, Ação (botão outline
     "Reprocessar forçado", "Reprocessando...").
   - Confirmação: "Reprocessar forçado? A entrada roda de novo mesmo já processada. Nada duplica; um toque
     que ficou sem origem pode ganhar um evento novo de reatribuição."

5. **Card "Revisão de identidade"** (fila de revisão). Descrição: "Entradas que trouxeram identificadores de
   duas pessoas diferentes. O sistema não mescla sozinho: decida aqui. Também é possível mesclar pela ficha
   da pessoa."
   - Mensagem da última ação + link "Abrir a pessoa que ficou" (acima da lista).
   - Vazio: "Nenhum conflito aberto."
   - Cada item (caixa com borda, cantos 10px, padding 16px; mais antigos primeiro, até 100):
     - "Aberto em {data e hora}" (12px cinza).
     - Motivo (14px), ex.: "Conflito de identidade: a mesma entrada trouxe identificadores de duas pessoas.
       Da pessoa A (escolhida): telefone 5562981110001. Da pessoa B: e-mail bianca@teste.local. A entrada foi
       vinculada à pessoa A pelo identificador mais forte; nada foi mesclado."
     - Dois mini cards lado a lado (empilham abaixo de 768px): "Pessoa A: {nome com link}" e
       "Pessoa B: {nome com link}", com badge outline "Já mesclada" quando for o caso, e linhas em cinza
       "Telefone: {...|-}", "E-mail: {...|-}", "Estágio: {...|Sem estágio}", "{n} eventos, {n} mensagens".
       Pessoa inexistente: "Pessoa não encontrada."
     - Ações: "Mesclar B em A" (primário pequeno), "Mesclar A em B" (outline pequeno), "Descartar" (ghost
       pequeno), mensagem e link "Abrir a pessoa que ficou". Os botões de mescla ficam desabilitados se
       faltar uma das pessoas.
   - **Dialog "Confirmar mescla"**: "{absorvida} será absorvida por {sobrevivente}. Identificadores, eventos
     e mensagens passam para quem fica; nada é apagado e a linha do tempo registra a mescla. Não há como
     desfazer pela tela." Botões "Cancelar" e "Mesclar".
   - "Descartar" pede confirmação: "Descartar este item? As duas pessoas continuam separadas." Sucesso:
     "Item descartado: as pessoas continuam separadas."
   - Outros retornos: "Pessoas mescladas: {n} identificadores, {n} eventos e {n} mensagens movidos.",
     "Este item já foi resolvido", "Item da fila não encontrado", "As pessoas não correspondem ao item da
     fila", "Item não encontrado ou já resolvido".

```
+------------------------------------------------------------------------------+
| Saúde                                                                        |
| +- Dispositivos ... Gerenciar dispositivos --------------------------------+ |
| | 1 dispositivo sem sinal.                                   (vermelho)    | |
| | Nome      Usuário  Número        Último sinal          Fila Versão Sit.  | |
| | PC Teste  -        +55 62 99..   há 40 min (Sem sinal)   3  0.1.0 Ativo  | |
| +--------------------------------------------------------------------------+ |
| +- Entradas com erro ou pendentes -----------------------------------------+ |
| | [Reprocessar pendentes e erros]                                          | |
| | Fonte  Chave       Recebida em  Tent. Erro          Status Ações         | |
| | manual teste-pa..  02/10 19:35    1   Entrada man.. (Erro) [Reprocessar] | |
| |                                                            Ignorar       | |
| +--------------------------------------------------------------------------+ |
| +- Reprocessar uma entrada já processada ----------------------------------+ |
| | Chave de idempotência [______________________]  [Buscar]                 | |
| +--------------------------------------------------------------------------+ |
| +- Revisão de identidade --------------------------------------------------+ |
| | Aberto em 02/10/2026, 19:35                                              | |
| | Conflito de identidade: a mesma entrada trouxe ...                       | |
| | +- Pessoa A: Alice -------------+ +- Pessoa B: Bianca ----------------+  | |
| | | Telefone, E-mail, Estágio,    | | Telefone, E-mail, Estágio,        |  | |
| | | 3 eventos, 2 mensagens        | | 1 eventos, 0 mensagens            |  | |
| | +-------------------------------+ +-----------------------------------+  | |
| | [Mesclar B em A] [Mesclar A em B]  Descartar                             | |
| +--------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------+
```

### 5.9 Usuários e números
- **Objetivo:** gerenciar quem acessa o sistema e os números de WhatsApp monitorados pelo piolho.
- **URL:** `/usuarios` (aba "Usuários e números | ..."). Gestão. Largura 1024px.

Blocos:

1. **Cabeçalho:** h1 "Usuários e números"; subtítulo "Quem acessa o sistema e quais números de WhatsApp são
   monitorados pelo piolho."
2. **Card "Usuários"** ("Cadastro fechado: só a gestão cria usuários. Troca de papel vale em até 5
   minutos."). Tabela em ordem alfabética:

| Coluna | Conteúdo |
| --- | --- |
| Nome | `font-medium`; no próprio usuário, " (você)" em cinza |
| E-mail | e-mail |
| Papel | select (144px) "Gestão"/"Comercial" + botão outline pequeno "Alterar". No próprio usuário: badge secondary com o papel e "O próprio papel não pode ser alterado" (12px cinza) |
| Criado em | data e hora (cinza) |
| Redefinir senha | campo de senha (160px, placeholder "Nova senha", mínimo 8) + botão outline pequeno "Redefinir" |

   Mensagens: "Papel alterado. Vale em até 5 minutos para sessões abertas.", "Você não pode alterar o seu
   próprio papel", "Senha redefinida." (redefinir derruba as sessões abertas daquele usuário),
   "A senha deve ter pelo menos 8 caracteres", "A senha deve ter no máximo 128 caracteres", "Usuário não encontrado".
3. **Card "Novo usuário"** ("Passe a senha inicial para a pessoa por um canal seguro."). Formulário em 2 colunas:

| Campo | Detalhe |
| --- | --- |
| "Nome" | obrigatório, até 120 |
| "E-mail" | obrigatório |
| "Papel" | select, padrão "Comercial" |
| "Senha inicial" | senha, mínimo 8, placeholder "Pelo menos 8 caracteres" |
| Botão | "Criar usuário" ("Criando...") |

   Mensagens: "Usuário {e-mail} criado.", "Já existe um usuário com este e-mail", "Informe o nome",
   "E-mail inválido", "Escolha um papel válido", "Nome longo demais".
4. **Card "Números monitorados"** ("Números novos também entram sozinhos quando um dispositivo manda sinal.
   Defina aqui o apelido, o papel e o usuário responsável."). Vazio: "Nenhum número cadastrado ainda."
   Tabela editável em linha (cada linha é um formulário):

| Coluna | Controle |
| --- | --- |
| Número | texto formatado "+55 62 98111-0000" |
| Apelido | campo (192px), placeholder "Ex.: Central Goiânia", até 80 |
| Papel | select (144px): "Sem papel", "Central", "SDR", "Vendedor" |
| Usuário | select (176px): "Nenhum" + usuários |
| (sem título) | botão outline pequeno "Salvar" + mensagem ("Número salvo.") |

5. **Card "Adicionar número"** ("O telefone é gravado na forma canônica (com DDI 55 e nono dígito)."). 2 colunas:

| Campo | Detalhe |
| --- | --- |
| "Telefone" | obrigatório, teclado de telefone, placeholder "Ex.: 62 99999-8888" |
| "Apelido" | até 80 |
| "Papel do número" | "Sem papel", "Central", "SDR", "Vendedor" |
| "Usuário vinculado" | "Nenhum" + usuários |
| Botão | "Adicionar número" ("Adicionando...") |

   Mensagens: "Número {número canônico} adicionado.", "O número {número} já está cadastrado", "Telefone
   inválido. Use DDD e número, ex.: 62 99999-8888", "Usuário não encontrado". (A mensagem de sucesso mostra
   o número sem formatação, ex.: "Número 5562981110002 adicionado.")

```
+----------------------------------------------------------------+
| Usuários e números                                             |
| +- Usuários -------------------------------------------------+ |
| | Nome            E-mail       Papel               Criado em | |
| | Comercial Teste comercial@.. [Comercial v][Alterar]  02/10 | |
| | Gestão (você)   gestao@..    (Gestão) O próprio papel...   | |
| |   Redefinir senha: [Nova senha] [Redefinir]                | |
| +------------------------------------------------------------+ |
| +- Novo usuário: Nome, E-mail, Papel, Senha inicial ---------+ |
| | [Criar usuário]                                            | |
| +------------------------------------------------------------+ |
| +- Números monitorados --------------------------------------+ |
| | +55 62 9811.. [Apelido] [Sem papel v] [Nenhum v] [Salvar]  | |
| +------------------------------------------------------------+ |
| +- Adicionar número: Telefone, Apelido, Papel, Usuário ------+ |
| | [Adicionar número]                                         | |
| +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

### 5.10 Dispositivos
- **Objetivo:** cadastrar os computadores com o piolho e gerar o token de cada um.
- **URL:** `/dispositivos` (aba "Dispositivos | ..."). Gestão. Largura 1024px.

Blocos:

1. **Cabeçalho:** h1 "Dispositivos"; subtítulo "Computadores com o piolho instalado. Cada um tem o seu token;
   no sistema fica guardado só o hash dele."
2. **Card "Dispositivos cadastrados"** ("Último sinal e fila pendente chegam pelo heartbeat do piolho.").
   Vazio: "Nenhum dispositivo cadastrado ainda." Tabela em ordem de nome (inativos em cinza):

| Coluna | Conteúdo |
| --- | --- |
| Nome | `font-medium` |
| Usuário | nome ou "-" |
| Número detectado | formatado ou "-" |
| Último sinal | data e hora absoluta ou "Nunca" |
| Último sync | data e hora ou "Nunca" |
| Fila | número, à direita |
| Versão | ou "-" |
| Situação | badge "Ativo"/"Inativo" |
| Ações | "Desativar"/"Reativar" e "Gerar novo token" (outline pequenos) + mensagens de erro 12px |

   - "Gerar novo token" pede confirmação: "Gerar um novo token para \"{nome}\"? O token atual deixa de
     funcionar na hora e o piolho desse computador precisa receber o novo."
   - Depois de gerar, aparece **uma linha extra logo abaixo do dispositivo**, ocupando todas as colunas, com
     a caixa do token (abaixo).
   - Sucesso de ativar/desativar não mostra mensagem (só atualiza a linha); erros: "Dispositivo não encontrado",
     "Dispositivo inválido".
3. **Card "Novo dispositivo"** ("O token aparece uma única vez, logo depois de criar. Copie e cole no piolho."):

| Campo | Detalhe |
| --- | --- |
| "Nome" | obrigatório, até 80, placeholder "Ex.: PC Comercial 1" |
| "Usuário (opcional)" | select "Nenhum" + usuários |
| Botão | "Criar dispositivo e gerar token" ("Gerando...") + mensagem "Dispositivo \"{nome}\" criado." |

   Erros: "Informe o nome", "Nome longo demais", "Usuário não encontrado".

**Caixa do token (mostrado uma única vez):** borda âmbar a 40%, fundo âmbar a 5%, cantos 8px, padding 16px.
- Linha 1: ícone `TriangleAlert` âmbar + "Copie agora: este token não será mostrado de novo." (14px `font-medium`).
- Linha 2: "Cole o token nas configurações do piolho neste computador. Se perder, gere um novo token." (12px cinza).
- Linha 3: o token em mono 12px sobre fundo `muted`, selecionável com um clique, + botão outline pequeno
  `Copy` "Copiar" (vira `Check` "Copiado").
- Ao gerar novo token pela linha da tabela, nenhuma mensagem de sucesso é mostrada: só aparece a caixa
  do token (a tela exibe apenas erros nessa linha).
- Recarregar a página faz a caixa sumir para sempre.

```
+----------------------------------------------------------------+
| Dispositivos                                                   |
| +- Dispositivos cadastrados ---------------------------------+ |
| | Nome   Usuário Núm. det.  Últ. sinal  Últ. sync Fila Versão | |
| | PC Ui  -       +55 62 ..  02/10 18:14 Nunca      0   0.1.0  | |
| |               (Ativo) [Desativar] [Gerar novo token]       | |
| | +- /!\ Copie agora: este token não será mostrado de novo. + | |
| | | [a1b2c3d4e5...token...]  [Copiar]                      | | |
| | +--------------------------------------------------------+ | |
| +------------------------------------------------------------+ |
| +- Novo dispositivo -----------------------------------------+ |
| | Nome [Ex.: PC Comercial 1]   Usuário (opcional) [Nenhum v] | |
| | [Criar dispositivo e gerar token]                          | |
| +------------------------------------------------------------+ |
+----------------------------------------------------------------+
```

## 6. Linguagem e microtextos
### 6.1 Vocabulário fixo

| Termo | Significado na interface |
| --- | --- |
| **Lead** | uma pessoa vista como oportunidade comercial; a palavra usada nas listas e contagens ("2 leads") |
| **Pessoa** | o registro único de alguém, com seus identificadores e linha do tempo; a ficha é a "Pessoa" |
| **Origem** | de onde o contato veio (anúncio, link, QR Code, formulário, LP, orgânico, indicação, desconhecida) |
| **Toque** | cada contato atribuído a uma origem (conversa iniciada ou formulário enviado). "Primeiro toque" e "Último toque" (o último antes da venda) |
| **Estágio** | coluna do funil (Kanban); tipos aberto, ganho e perdido |
| **Responsável** | usuário do sistema dono do lead; pode ser "Sem responsável" |
| **Dispositivo** | computador com a extensão piolho; tem token próprio, último sinal, fila pendente |
| **Número monitorado** | número de WhatsApp da empresa acompanhado pelo piolho; tem apelido, papel (Central, SDR, Vendedor) e usuário |
| **Entrada bruta** | cada dado recebido, gravado cru antes do processamento; na tela aparece como "entrada", com fonte, chave de idempotência, status e tentativas |
| **Fila de revisão** | conflitos de identidade esperando decisão da gestão; na tela "Revisão de identidade" |
| **Mescla** | juntar duas pessoas: a "absorvida" passa tudo para a "que fica" (sobrevivente) |
| **Texto de abertura** | primeira mensagem do WhatsApp (até 300 caracteres), único conteúdo de conversa guardado |
| **Opt-out** | a pessoa pediu para não receber contato |
| **Piolho** | nome da extensão do Chrome que lê o WhatsApp Web |

Status de entrada: "Pendente", "Processada", "Erro", "Ignorada". Papéis: "Gestão", "Comercial".

### 6.2 Formatos (`src/lib/formatacao.ts`), sempre no horário de Brasília
| Função | Exemplo | Uso | Vazio |
| --- | --- | --- | --- |
| Data e hora | "02/10/2026, 11:03" | linha do tempo, contatos, criado em, último sinal (Dispositivos) | "Nunca" (ou vazio, conforme a tela) |
| Só data | "02/10/2026" | "Primeiro contato" na lista de Leads | vazio |
| Dia com semana | "sex., 02/10/2026" | mensagens do dia, tabela "Leads por dia" | |
| Dia curto do gráfico | "30/09" | eixo X de "Leads por dia" | |
| Telefone celular | "+55 62 99999-9999" | todo telefone exibido | |
| Telefone fixo | "+55 62 3333-4444" | | |
| Outros números | "+{dígitos}" | números estrangeiros | |
| Números | "1.234" (Intl pt-BR) | Painel | |
| Percentual | "75%", "33,3%" (até 1 casa) | Painel | |
| Moeda | "R$ 1.997,00" | evento de venda (Fase 2) | |

**Duração** (tempo de resposta, "Esperando há"): "menos de 1 min", "4 min", "2 h 15 min" (minutos só
abaixo de 10 h), "12 h", "1 dia", "3 dias".

**Tempo relativo** (último sinal, badge do Kanban): "agora há pouco" (menos de 1 min), "há 5 min", "há 2 h",
"há 1 dia", "há 3 dias". Datas no futuro contam como "agora há pouco". Sem data: "Nunca" na Saúde.

Plural simples com número: "1 lead"/"2 leads", "1 dia"/"30 dias", "1 recebida"/"2 recebidas". Algumas
telas usam "(s)": "{n} lead(s) no primeiro toque", "{n} toque(s)", "{n} origem(ns) criada(s)".

### 6.3 Eventos na linha do tempo (`src/lib/linha-do-tempo.ts`)
| Tipo | Título | Detalhes possíveis |
| --- | --- | --- |
| `form_enviado` | "Formulário da Meta enviado" / "Formulário da LP enviado" / "Formulário enviado" | "Origem: {origem}", "Origem atribuída no reprocessamento", "Cidade: {cidade}", "Campanha (UTM): {campanha}" |
| `conversa_iniciada` | "Conversa iniciada no WhatsApp" | "Número: +55 62 ...", "Origem: {origem}", "Origem atribuída no reprocessamento"; e "Texto de abertura: {texto}" (12px cinza, identificado) |
| `estagio_alterado` | "Estágio alterado de {de} para {para}" ou, sem estágio anterior, "Entrou no estágio {para}" | "Movimento automático" (quando o sistema moveu), "Motivo da perda: {motivo}" |
| `responsavel_alterado` | "Responsável alterado de {de} para {para}" (lado vazio vira "ninguém") | |
| `reuniao_agendada` | "Reunião agendada" | "Canal: {canal}" |
| `ingresso_comprado` | "Ingresso comprado" | "Canal: {canal}" |
| `checkin_evento` | "Check-in no evento" | "Canal: {canal}" |
| `venda_registrada` | "Venda registrada" | "Produto: {produto}", "Valor: R$ {valor}", "Canal: {canal}" |
| `identidade_mesclada` | "Identidade mesclada" | "Absorveu a pessoa {nome}" (ou "Absorveu outra pessoa"), "Movidos: {n} identificadores, {n} eventos, {n} mensagens" |
| `nota` com texto | "Nota" | o texto da nota (preserva quebras de linha) |
| `nota` sem texto | "Lead cadastrado manualmente" | |
| outro | "Evento {tipo}" | |

Canais (rótulo em "Canal: ..."): "WhatsApp", "formulário da Meta", "formulário da LP", "Hotmart",
"presencial". O canal "lançamento manual" não aparece.

Notas automáticas geradas por ações da tela (aparecem como "Nota"): "Opt-out ativado", "Opt-out desativado",
"Nome alterado de \"{antigo}\" para \"{novo}\"" (com "sem nome" quando vazio). A nota do Novo lead aparece
com o texto digitado.

Abaixo do título, toda ação manual mostra "{data e hora} por {usuário}". **Eventos de reatribuição** (quando
uma entrada é reprocessada à força e o toque ganha origem) aparecem como um evento novo do mesmo tipo com a
linha "Origem atribuída no reprocessamento"; o evento original continua lá.

Mensagens do dia: "Mensagens em {dia} no número {número}" + "{n} recebidas, {n} enviadas, 1ª resposta em
{duração}" ou "..., sem resposta".

## 7. Fluxos principais
### 7.1 Comercial atende um lead do WhatsApp

1. A pessoa manda mensagem para um número monitorado. O piolho envia os metadados; o sistema cria (ou acha)
   a pessoa, coloca no estágio inicial **Novo lead** e grava "Conversa iniciada no WhatsApp" com a origem e o
   texto de abertura.
2. **Kanban:** o cartão aparece em "Novo lead" com o badge âmbar "Sem resposta há {tempo}". O comercial pode
   filtrar por "Responsável" (ex.: ele mesmo ou "Sem responsável").
3. Clica no nome do cartão e abre a **Pessoa**: vê primeiro toque, texto de abertura, identificadores.
   Define o "Responsável" (salva ao mudar).
4. Responde no **WhatsApp Web** (fora do sistema). O piolho registra a mensagem enviada; o sistema move
   sozinho para **Em conversa** ("Estágio alterado de Novo lead para Em conversa" + "Movimento automático")
   e o badge some.
5. Ao longo do atendimento: adiciona notas ("Adicionar nota") e arrasta o cartão no Kanban (ou usa o
   select "Estágio" na ficha). Para **Perdido**, informa o motivo no dialog. Ganho vai para "Cliente Gestão PRO".

### 7.2 Gestão cadastra um dispositivo e um número
1. **Dispositivos > Novo dispositivo:** preenche "Nome" (ex.: "PC Comercial 1") e, se quiser, o usuário;
   clica "Criar dispositivo e gerar token".
2. Aparece a caixa âmbar com o token: "Copiar" e colar nas configurações do piolho daquele computador.
3. O piolho manda o primeiro sinal: em Dispositivos aparecem "Número detectado", "Último sinal", "Versão";
   o número entra sozinho em **Usuários e números > Números monitorados**.
4. Em **Números monitorados**, a gestão define "Apelido", "Papel" (Central, SDR, Vendedor) e "Usuário" e
   clica "Salvar" na linha. Alternativa: cadastrar antes em "Adicionar número".
5. **Saúde > Dispositivos** passa a acompanhar o sinal (alerta "Sem sinal" em horário comercial).
6. Perdeu o token: "Gerar novo token" (com confirmação); o antigo para na hora.

### 7.3 Gestão cria origem com QR
1. **Origens > Nova origem.**
2. Preenche "Código" (ex.: `gnv-maceio-2026`), "Nome", "Tipo" = "QR Code" ou "Link do WhatsApp" e o "Texto
   pré-preenchido (WhatsApp)" como a pessoa vai enviar. Opcionais: cidade, evento, produto. "Criar origem".
3. Vai para o **detalhe da origem**, com o card "Link do WhatsApp e QR Code" já com o texto digitado.
4. Escolhe o "Número de destino" e clica "Gerar link e QR". Aparecem o link, "Abrir no WhatsApp" e o QR Code.
5. "Baixar QR Code (SVG)" para usar no material. Nada é gravado: para outro número, gerar de novo.
6. Conversas cuja primeira mensagem começa com o padrão passam a ser atribuídas a essa origem; os números
   aparecem nas colunas Leads e Toques da lista e no Painel.

### 7.4 Gestão resolve um conflito de identidade
1. Uma entrada traz identificadores de duas pessoas (ex.: telefone de uma, e-mail de outra). O sistema não
   mescla: vincula à pessoa A e abre um item na fila.
2. **Saúde > Revisão de identidade:** lê o motivo e compara os cartões "Pessoa A" e "Pessoa B" (pode abrir
   cada ficha pelo link).
3. Escolhe "Mesclar B em A" ou "Mesclar A em B"; confirma no dialog "Confirmar mescla".
4. A mensagem "Pessoas mescladas: ..." aparece acima da lista com "Abrir a pessoa que ficou"; o item some.
   A ficha da que ficou ganha o evento "Identidade mesclada". A ficha da absorvida passa a redirecionar.
5. Se forem pessoas diferentes: "Descartar" (confirmação); elas continuam separadas.
6. Caminho alternativo, sem fila: **Pessoa > Mesclar com outra pessoa** (id, telefone ou e-mail + quem fica).

### 7.5 Gestão reprocessa uma entrada com erro
1. **Saúde > Entradas com erro ou pendentes:** vê fonte, chave, tentativas e o erro (clicar expande).
2. Corrige a causa (ex.: cadastra a origem ou o número que faltava) e clica "Reprocessar" na linha, ou
   "Reprocessar pendentes e erros" para todas (resumo "Total: ... · processadas: ... · com erro: ...").
3. Resultado acima da tabela ("{fonte} {chave}: Entrada processada com sucesso." ou "Continua com erro: ...").
4. Se a entrada não tem como ser aproveitada: "Ignorar" (confirmação); sai da fila, nada é apagado.
5. Para reatribuir a origem de uma entrada **já processada** (depois de cadastrar uma origem nova):
   card "Reprocessar uma entrada já processada", busca pela chave e "Reprocessar forçado" (confirmação).
   A linha do tempo ganha um evento novo com "Origem atribuída no reprocessamento".
6. Em paralelo, o n8n chama o reprocessamento automático a cada 5 minutos (até 10 tentativas por entrada).

### 7.6 Novo lead manual
1. **Leads > Novo lead** (botão no cabeçalho).
2. Preenche nome, telefone e/ou e-mail (pelo menos um dos dois) e, se quiser, uma nota. "Salvar lead".
3. Mensagem "Lead salvo. Se o telefone ou o e-mail já existiam, ele foi vinculado à mesma pessoa." e o link
   "Abrir a ficha". O lead cai em **Novo lead** e aparece no Kanban e na lista.
4. Se o processamento falhar, a entrada fica para reprocessamento (aparece na Saúde).

## 8. Fora do escopo visual e futuro
### 8.1 Fase 2 (não existe nenhuma tela ainda)

- Vendas: webhook da Hotmart, webhook da plataforma do Gestão PRO e **venda manual do vendedor**.
- Tela de **Conciliação**: venda do vendedor x venda da plataforma, casando por pessoa, produto, valor e
  janela de dias. Quando a venda é conciliada, o lead vai sozinho para "Cliente Gestão PRO".
- O evento "Venda registrada" e o "Último toque antes da venda" já estão previstos na linha do tempo e no Painel.

### 8.2 Telas e funções que ainda não existem
- Edição de estágios (nomes e ordem vêm do seed; não há tela).
- Desativar ou excluir usuário; editar nome e e-mail de usuário; troca de senha pelo próprio usuário;
  recuperação de senha.
- Excluir origem ou dispositivo (só ativar e desativar).
- Página 404 e página de erro personalizadas.
- Alternador de tema claro/escuro (os tokens escuros existem).
- Envio de mensagens, mídia e qualquer integração com o CRM do Carlos (fora de escopo do produto).

### 8.3 Melhorias de UX observadas no código (sugestões)
1. **Início** é um texto de status de desenvolvimento, desatualizado. Pode virar um resumo por papel
   (leads sem resposta do usuário, alertas de dispositivo e entradas com erro para a gestão).
2. **Confirmações misturadas:** a mescla da Saúde usa dialog, mas mesclar pela ficha, ignorar entrada,
   descartar conflito, reprocessar forçado e gerar novo token usam a caixa nativa do navegador. Padronizar
   num dialog do sistema.
3. **Feedback fraco:** mensagens de sucesso são texto cinza sem ícone ao lado do botão; fáceis de não
   perceber. Considerar toast ou destaque visual, mantendo o texto.
4. **Sem estados de carregamento:** navegação e filtros não mostram skeleton nem indicador; só os botões
   mudam de texto.
5. **Tabela de Origens com 13 colunas** e rolagem horizontal; vale priorizar Código, Nome, Tipo, Leads,
   Toques e Situação e levar o resto para o detalhe ou para uma linha expansível.
6. **"Voltar para Leads"** é fixo na ficha da Pessoa, mesmo quando se chegou pelo Kanban, Painel ou Saúde.
7. **Kanban:** o estado das colunas finais expandidas não é lembrado, e não há forma de mover um lead sem
   arrastar dentro do próprio quadro (no celular depende do toque e arrasto).
8. **Textos desatualizados:** o card "Primeiro toque" em Origens diz "botão previsto na tela Saúde", mas o
   reprocessamento já existe lá; a mensagem de número adicionado mostra o número sem formatação.

## 9. Anexo
### 9.1 Inventário de componentes

`src/components/ui` (shadcn/ui, estilo new-york):

| Componente | Arquivo | Uso |
| --- | --- | --- |
| Badge | `badge.tsx` | rótulos de estágio, status, situação; variantes default, secondary, destructive, outline |
| Button | `button.tsx` | todos os botões; variantes default, destructive, outline, secondary, ghost, link; tamanhos default, sm, lg, icon |
| Card | `card.tsx` | bloco padrão de conteúdo (Header, Title, Description, Content; Action e Footer não usados) |
| Dialog | `dialog.tsx` | Novo lead, motivo da perda, confirmar mescla |
| DropdownMenu | `dropdown-menu.tsx` | menu do topo no celular |
| Input | `input.tsx` | campos de texto, e-mail, senha, data |
| Label | `label.tsx` | rótulos de campos |
| NativeSelect | `native-select.tsx` | todos os selects (nativos, com seta sobreposta) |
| Separator | `separator.tsx` | divisórias da barra lateral |
| Table | `table.tsx` | todas as tabelas (com rolagem horizontal) |
| Textarea | `textarea.tsx` | notas, motivo da perda, texto pré-preenchido; cresce com o conteúdo |

`src/components/app` (do sistema):

| Componente | Arquivo | Uso |
| --- | --- | --- |
| MenuLateral / MenuTopo | `navegacao.tsx` | menu da barra lateral e menu suspenso do celular, filtrados pelo papel |
| BotaoSair | `botao-sair.tsx` | botão "Sair" do rodapé da barra lateral |
| MensagemAcao | `mensagem-acao.tsx` | retorno de sucesso (cinza) ou erro (vermelho) das ações |
| DialogoMotivoPerda | `dialogo-motivo-perda.tsx` | dialog "Mover para {estágio}" com motivo obrigatório |
| BarrasHorizontais / Colunas | `graficos.tsx` | gráficos SVG do Painel |

### 9.2 Mapa de rotas
| Rota | Tela | Acesso | Parâmetros | Arquivo |
| --- | --- | --- | --- | --- |
| `/login` | Login | público | `next` | `app/(auth)/login/page.tsx` |
| `/` | Início | todos | `erro=sem-permissao` | `app/(app)/page.tsx` |
| `/kanban` | Kanban | todos | `busca`, `responsavel` | `app/(app)/kanban/page.tsx` |
| `/leads` | Leads | todos | `busca`, `origem`, `cidade`, `estagio`, `responsavel`, `de`, `ate`, `pagina` | `app/(app)/leads/page.tsx` |
| `/pessoas/{id}` | Pessoa | todos (mescla só gestão) | âncoras `#dados`, `#linha-do-tempo`, `#identificadores`, `#mesclar` | `app/(app)/pessoas/[id]/page.tsx` |
| `/origens` | Origens | gestão | | `app/(app)/(gestao)/origens/page.tsx` |
| `/origens/nova` | Nova origem | gestão | | `app/(app)/(gestao)/origens/nova/page.tsx` |
| `/origens/{id}` | Detalhe da origem | gestão | `texto` (pré-preenche o gerador); âncora `#link` | `app/(app)/(gestao)/origens/[id]/page.tsx` |
| `/painel` | Painel | gestão | `de`, `ate`, `cidade`, `origem` | `app/(app)/(gestao)/painel/page.tsx` |
| `/saude` | Saúde | gestão | `chave`; âncoras `#dispositivos`, `#entradas`, `#busca-entrada`, `#revisao` | `app/(app)/(gestao)/saude/page.tsx` |
| `/usuarios` | Usuários e números | gestão | | `app/(app)/(gestao)/usuarios/page.tsx` |
| `/dispositivos` | Dispositivos | gestão | | `app/(app)/(gestao)/dispositivos/page.tsx` |

Rotas sem tela (API, não fazem parte do layout): `/api/auth/*`, `/api/ingest/whatsapp`,
`/api/ingest/heartbeat`, `/api/webhooks/meta`, `/api/webhooks/framer`, `/api/cron/reprocessar`.
