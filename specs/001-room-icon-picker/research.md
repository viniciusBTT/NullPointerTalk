# Phase 0 Research: Modal de escolha de ícone no CRUD de salas

Nenhum `[NEEDS CLARIFICATION]` restou do `spec.md` — as ambiguidades relevantes já foram
resolvidas lá, na seção Assumptions. As decisões abaixo tratam de *como* implementar dentro das
convenções já estabelecidas neste repositório, levantadas lendo o código existente
(`room-admin.js`, `settings-modal.js`, `lib/dom.js`, `overlays.css`, `Room.java` e as
validações de `RoomCreateRequest`/`RoomUpdateRequest`).

## Decisão 1: módulo dedicado `icon-picker.js`, não lógica inline em `room-admin.js`

- **Decision**: Criar `src/main/resources/static/js/ui/icon-picker.js`, seguindo o mesmo
  formato de `initX({ ...elementos, onSelect })` já usado por `initSettingsModal` e
  `initRoomAdmin` (função `init*` que recebe referências de elementos DOM e retorna uma API
  mínima).
- **Rationale**: O codebase já isola cada modal em seu próprio módulo (`settings-modal.js`,
  `name-gate.js`, `participant-popover.js`); `room-admin.js` hoje só orquestra CRUD (abrir
  criar/editar, montar `fetch`, mostrar erro) e não tem lógica de abrir/fechar uma *segunda*
  modal. Manter essa separação evita que `room-admin.js` cresça com responsabilidade que não é
  dela.
- **Alternatives considered**:
  - Lógica inline em `room-admin.js` — rejeitada: duplicaria, dentro do mesmo arquivo, o
    boilerplate de abrir/fechar/backdrop/Esc que já existe como padrão replicável em outro
    módulo, e misturaria duas responsabilidades (CRUD de sala vs. seleção de ícone).
  - Um componente/modal genérico reutilizável para "qualquer picker" — rejeitada: não existe
    ainda um segundo caso de uso para generalizar; construir abstração para uma necessidade
    hipotética viola o princípio de minimalismo (Constitution I).

## Decisão 2: catálogo de ícones como constante JS estática, sem endpoint novo

- **Decision**: A lista de ícones pré-definidos é uma constante JS (array de objetos
  `{ glyph, label }`, `label` só para acessibilidade/`title`) definida no próprio
  `icon-picker.js` (ou um arquivo `lib/room-icons.js` se o array crescer o suficiente para
  justificar separar), sem vir de configuração nem de tabela no Postgres.
- **Rationale**: `Room.icon` (`Room.java`) e as validações (`RoomCreateRequest`,
  `RoomUpdateRequest`) já tratam ícone como texto livre (`@Size(max = 32)`), sem noção de
  catálogo no backend hoje — introduzir uma tabela/endpoint só para uma lista curada e estática
  seria complexidade sem necessidade real (Constitution I, FR-010 do spec).
- **Alternatives considered**:
  - Endpoint `GET /api/room-icons` servindo a lista — rejeitada: sem necessidade concreta hoje
    (a lista não muda em runtime, não depende de dados por sala/usuário); adicionar um endpoint
    só pra evitar hardcode no JS seria complexidade especulativa.
  - Biblioteca externa de emoji picker (unicode completo, busca, categorias) — já rejeitada
    explicitamente no spec (`Assumptions`), por trazer dependência nova/CDN, contra Constitution
    I e II.

## Decisão 3: `#room-form-icon` continua a única fonte de verdade

- **Decision**: O `<input id="room-form-icon">` que já existe em `shell.html` continua sendo o
  valor que `room-admin.js` lê no `submit` (`iconInputEl.value.trim()`), sem duplicar o estado
  de "ícone selecionado" em outra variável. A modal de ícones só faz duas coisas: (a) ao abrir,
  ler o valor atual desse input para destacar a opção correspondente (se houver, per FR-005); e
  (b) ao escolher uma opção, escrever nesse input e fechar. O input em si deixa de aceitar
  digitação livre do usuário (vira somente-leitura/disparador do picker), mas seu `value`
  continua sendo o dado real.
- **Rationale**: Resolve de graça vários requisitos sem estado extra:
  - **FR-006** (ícone legado fora do catálogo) — se o valor atual não bate com nenhuma opção da
    grade, simplesmente nenhuma opção fica marcada como selecionada, mas o `value` do input (e
    portanto o que é enviado no `submit`) não muda.
  - **FR-008** (cancelar não altera o ícone) — cancelar é só fechar a modal sem escrever no
    input; como não há um "valor pendente" separado, não existe nada para reverter.
  - **FR-004** (preview do ícone selecionado) — um pequeno elemento de preview (ex.: `<span>`)
    ao lado/dentro do botão que abre a modal já pode ler o mesmo `value`.
- **Alternatives considered**:
  - Guardar a seleção pendente em uma variável de estado no `icon-picker.js` e só "confirmar" no
    input com um botão extra de "aplicar" — rejeitada: complexidade extra (mais um passo de
    confirmação, mais um estado a manter sincronizado) sem requisito do spec que peça
    confirmação em duas etapas; FR-003 já pede que escolher uma opção *aplique* o ícone
    diretamente.

## Decisão 4: grade construída via `el()`/`append()`, sem `innerHTML`

- **Decision**: Os botões da grade de ícones são criados com `el('button', { class: ..., text:
  glyph, title: label, onClick: ... })` de `lib/dom.js`, um por item do catálogo.
- **Rationale**: Não é bem uma "decisão de projeto" — é a única forma suportada no codebase:
  `el()` lança erro se receber uma prop `html`, o que impõe a invariante "zero `innerHTML`" já
  documentada no topo de `lib/dom.js`. Qualquer outra abordagem quebraria essa convenção
  existente.
- **Alternatives considered**: N/A — não há alternativa dentro das convenções do projeto.

## Decisão 5: acessibilidade e fechamento seguem o padrão de `settings-modal.js`

- **Decision**: A modal de ícones fecha por clique no backdrop, por um botão com
  `data-close="icon-picker"` (mesmo padrão de `data-close="settings"`/`data-close="room-form"`
  já usado em `app.js`), e por tecla Esc via um listener em `document` que checa
  `!root.classList.contains('hidden')` antes de agir — texto idêntico ao já existente em
  `settings-modal.js:35-39`.
- **Rationale**: Reaproveitar literalmente o padrão já testado manualmente em produção evita
  reinventar comportamento de acessibilidade/teclado (FR-009) e mantém consistência de UX entre
  todas as modais do app.
- **Alternatives considered**: `<dialog>` nativo do HTML — rejeitada: nenhuma outra modal do app
  usa `<dialog>` (todas usam a mesma `.modal`/`.modal__card` com `hidden` via classe); introduzir
  um segundo padrão de modal só para esta tela quebraria a consistência visual/comportamental
  das demais, sem ganho que justifique a divergência.
