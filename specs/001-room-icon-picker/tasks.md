---

description: "Task list template for feature implementation"
---

# Tasks: Modal de escolha de ícone no CRUD de salas

**Input**: Design documents from `/specs/001-room-icon-picker/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: Não solicitados na especificação, e o projeto não tem harness de teste automatizado
para frontend (ver `plan.md`, Technical Context → Testing). A verificação usa os cenários
manuais de `quickstart.md`, referenciados diretamente nas tasks de validação de cada história.

**Organization**: Tasks agrupadas por user story (spec.md) pra permitir implementação e teste
independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência)
- **[Story]**: A qual user story esta task pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Aplicação de módulo único (Constitution Principle II) — sem `frontend/`/`backend/` separados.
Todos os caminhos abaixo são relativos à raiz do repositório, dentro de
`src/main/resources/{templates,static}` (mais um parágrafo em `docs/projeto/frontend.md`),
conforme `plan.md` → Project Structure. Nenhum arquivo em `src/main/java` muda.

## Phase 1: Setup

**Purpose**: Criar o módulo novo com o catálogo de ícones que todo o resto depende

- [X] T001 Criar `src/main/resources/static/js/ui/icon-picker.js` com a constante
  `ROOM_ICON_CATALOG` (lista curada de objetos `{ glyph, label }`, ver
  [data-model.md](./data-model.md) → "Catálogo de ícones") e um export `initIconPicker()` vazio
  (só o esqueleto da função, sem lógica de render/open/close ainda — isso vem na Fase 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura da modal de seleção que TODAS as user stories precisam ter pronta
antes de começar

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa

- [X] T002 [P] Adicionar o markup da `#icon-picker-modal` em
  `src/main/resources/templates/shell.html`: um `.modal.hidden` com `.modal__card`, um
  `.modal__header` (título + botão de fechar com `data-close="icon-picker"`, seguindo o mesmo
  padrão de `#settings-modal`/`#room-form-modal` já existentes no arquivo) e um contêiner vazio
  `<div id="icon-picker-grid">` onde os botões de ícone serão inseridos via JS
- [X] T003 [P] Adicionar os estilos `.icon-picker__grid` e `.icon-picker__option` em
  `src/main/resources/static/css/overlays.css` (grid que quebra em mais linhas em telas
  estreitas, sem rolagem horizontal — reaproveitando o componente `.modal`/`.modal__card` já
  existente no mesmo arquivo)
- [X] T004 Em `src/main/resources/templates/shell.html`, ajustar o campo de ícone dentro de
  `#room-form` (o atual `<input id="room-form-icon" ...>`): adicionar o atributo `readonly`
  (mantendo `required`, embora a validação nativa não baste mais — ver T009) e adicionar um
  botão `<button type="button" id="room-form-icon-trigger">Escolher ícone</button>` ao lado dele
  (depende de T002 terminar antes, pois edita o mesmo arquivo)
- [X] T005 Implementar `initIconPicker({ root, gridEl, closeButtons, onSelect })` em
  `src/main/resources/static/js/ui/icon-picker.js`: monta um botão por item de
  `ROOM_ICON_CATALOG` usando `el()`/`append()` de `lib/dom.js` (sem `innerHTML`), cada clique
  numa opção chama `onSelect(glyph)` e fecha a modal; os `closeButtons` fecham sem chamar
  `onSelect`; expõe um método `open()` (depende de T001, T002)
- [X] T006 Instanciar `initIconPicker` em `src/main/resources/static/js/app.js`, ao lado das
  chamadas existentes de `initSettingsModal`/`initRoomAdmin`, passando as referências DOM
  criadas em T002 (depende de T005)
- [X] T007 Em `src/main/resources/static/js/ui/room-admin.js`, ligar o clique em
  `#room-form-icon-trigger` (recebido como nova dependência injetada, mesmo padrão de
  `roomsById`/`onError` já usado) para chamar o `open()` do icon picker; o callback de seleção
  grava o glyph escolhido em `iconInputEl.value` (depende de T004, T006)

**Checkpoint**: a modal de ícone já abre a partir do formulário de sala (criar ou editar) e uma
escolha já reflete no campo — as user stories abaixo só adicionam comportamento sobre essa base.

---

## Phase 3: User Story 1 - Escolher ícone ao criar uma sala (Priority: P1) 🎯 MVP

**Goal**: Ao criar uma sala nova, a pessoa escolhe o ícone clicando numa opção da modal, em vez
de digitar um emoji.

**Independent Test**: Abrir "Nova sala", acionar a seleção de ícone, escolher uma opção,
confirmar que o formulário reflete a escolha, enviar e confirmar que a sala é criada com aquele
ícone.

### Implementation for User Story 1

- [X] T008 [US1] Em `openCreate()` (`src/main/resources/static/js/ui/room-admin.js`), garantir
  que o campo de ícone começa vazio e sem nenhuma opção pré-aplicada — estado padrão de "Nova
  sala" (FR-002/FR-003)
- [X] T009 [US1] No handler de `submit` de `#room-form`
  (`src/main/resources/static/js/ui/room-admin.js`), adicionar uma checagem explícita de que
  `iconInputEl.value` não está vazio antes do `fetch`, chamando `showError(...)` caso contrário
  — necessário porque um input `readonly` fica isento da validação nativa `required` do
  navegador (FR-007)
- [X] T010 [US1] Rodar o Cenário 1 de [quickstart.md](./quickstart.md) manualmente: criar uma
  sala escolhendo um ícone pela modal, confirmar que ela é criada com aquele ícone e aparece
  corretamente na barra lateral e no cabeçalho

**Checkpoint**: User Story 1 completa e testável de forma independente.

---

## Phase 4: User Story 2 - Trocar o ícone de uma sala existente (Priority: P2)

**Goal**: Ao editar uma sala, a modal mostra o ícone atual destacado (quando ele está no
catálogo) e permite trocá-lo; um ícone legado fora do catálogo é preservado.

**Independent Test**: Editar uma sala existente, abrir a seleção de ícone, confirmar que o
ícone atual aparece destacado, escolher outro, salvar, e confirmar que a sala passa a exibir o
novo ícone.

### Implementation for User Story 2

- [X] T011 [US2] Em `src/main/resources/static/js/ui/icon-picker.js`, estender `open()` para
  aceitar o valor de ícone atual e marcar como selecionado o botão do catálogo cujo `glyph`
  bate com ele (estado `.is-selected`), quando aberto a partir de uma edição (FR-005) (depende
  de T005)
- [X] T012 [P] [US2] Adicionar o estado visual `.icon-picker__option.is-selected` em
  `src/main/resources/static/css/overlays.css` (depende de T003)
- [X] T013 [US2] Em `openEdit()` (`src/main/resources/static/js/ui/room-admin.js`), passar o
  ícone atual da sala para o `open()` do icon picker, de forma que a seleção atual apareça
  destacada (depende de T007, T011)
- [X] T014 [US2] Rodar os Cenários 2 e 2b de [quickstart.md](./quickstart.md) manualmente:
  editar o ícone de uma sala existente pela modal (confirmando o destaque do ícone atual e a
  troca funcionando), e confirmar que um ícone fora do catálogo (ex.: `🦄`, setado direto via
  `PUT /api/rooms/estudos`) continua sendo exibido e preservado até que outra opção seja
  escolhida (FR-006)

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente.

---

## Phase 5: User Story 3 - Cancelar a escolha sem perder o ícone atual (Priority: P3)

**Goal**: Fechar a modal de ícones sem escolher uma opção (botão, clique no backdrop, ou Esc)
nunca altera o ícone já selecionado no formulário.

**Independent Test**: Abrir a modal de ícones (criando ou editando), fechá-la pelos três
caminhos sem clicar em nenhuma opção, e confirmar que o ícone do formulário não muda em nenhum
dos três.

### Implementation for User Story 3

- [X] T015 [US3] Em `src/main/resources/static/js/ui/icon-picker.js`, adicionar fechamento por
  clique no backdrop (clique no próprio `root`, não em um filho), espelhando o padrão de
  `src/main/resources/static/js/ui/settings-modal.js` — sem chamar `onSelect` (depende de T005)
- [X] T016 [US3] Em `src/main/resources/static/js/ui/icon-picker.js`, adicionar um listener de
  tecla Esc em `document` que fecha a modal só enquanto ela está visível, espelhando
  `src/main/resources/static/js/ui/settings-modal.js:35-39` (FR-009) (depende de T005)
- [X] T017 [US3] Rodar o Cenário 3 de [quickstart.md](./quickstart.md) manualmente: abrir a
  modal (na criação e na edição) e fechá-la pelo botão de cancelar, pelo backdrop e pela tecla
  Esc — confirmar que o valor de ícone do formulário nunca muda em nenhum dos três caminhos
  (FR-008)

**Checkpoint**: As três user stories funcionam de forma independente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Acabamentos que atravessam as três histórias

- [X] T018 [P] Adicionar/confirmar uma regra responsiva em
  `src/main/resources/static/css/overlays.css` para que `.icon-picker__grid` quebre em mais
  linhas sem rolagem horizontal em telas estreitas (Edge Case / Cenário 5 de
  [quickstart.md](./quickstart.md))
- [X] T019 [P] Acrescentar um parágrafo curto em `docs/projeto/frontend.md` documentando a
  abordagem do catálogo de ícones client-side (per `plan.md` → Constitution Check, Princípio IV)
- [X] T020 Rodar a validação completa de [quickstart.md](./quickstart.md) (todos os 5 cenários)
  de ponta a ponta antes de considerar a feature concluída

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende de Setup (T001) — BLOQUEIA todas as user stories
- **User Stories (Phase 3-5)**: todas dependem da conclusão de Foundational
  - Podem prosseguir em paralelo (se houver mais de uma pessoa) ou em ordem de prioridade
    (P1 → P2 → P3)
- **Polish (Phase 6)**: depende das user stories desejadas estarem completas

### User Story Dependencies

- **User Story 1 (P1)**: pode começar após Foundational — sem dependência de outras stories
- **User Story 2 (P2)**: pode começar após Foundational — reaproveita a base de US1 (mesmo
  `open()`/mesmo formulário), mas é testável de forma independente
- **User Story 3 (P3)**: pode começar após Foundational — estende o fechamento da modal de
  US1/US2, mas é testável de forma independente

### Parallel Opportunities

- T002 e T003 (Fase 2) — arquivos diferentes (`shell.html` vs `overlays.css`), sem dependência
  entre si
- T011 e T012 (Fase 4) — arquivos diferentes (`icon-picker.js` vs `overlays.css`)
- T018 e T019 (Fase 6) — arquivos diferentes (`overlays.css` vs `docs/projeto/frontend.md`)

---

## Parallel Example: Foundational (Phase 2)

```bash
# T002 e T003 podem rodar juntas — não compartilham arquivo nem dependência:
Task: "Adicionar markup de #icon-picker-modal em src/main/resources/templates/shell.html"
Task: "Adicionar estilos .icon-picker__grid/.icon-picker__option em src/main/resources/static/css/overlays.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup (T001)
2. Completar Fase 2: Foundational (T002-T007) — CRÍTICO, bloqueia todas as stories
3. Completar Fase 3: User Story 1 (T008-T010)
4. **PARAR e VALIDAR**: rodar o Cenário 1 de `quickstart.md` de forma independente
5. Nesse ponto já existe um MVP demonstrável: criar sala escolhendo ícone pela modal

### Incremental Delivery

1. Setup + Foundational → base pronta (modal abre, seleção aplica no formulário)
2. + User Story 1 → testar independentemente → MVP demonstrável
3. + User Story 2 → testar independentemente → destaque do ícone atual e preservação de
   ícones legados
4. + User Story 3 → testar independentemente → fechamento garantidamente não-destrutivo
5. + Polish → responsividade, nota em `docs/projeto/frontend.md`, validação completa

---

## Notes

- [P] = arquivos diferentes, sem dependência
- [Story] mapeia cada task pra uma user story específica, pra rastreabilidade
- Sem tasks de teste automatizado: o projeto não tem harness de frontend (ver `plan.md`); a
  verificação é manual, via `quickstart.md`, referenciada nas tasks T010/T014/T017/T020
- Cada user story é completável e testável de forma independente, mesmo reaproveitando a mesma
  modal/formulário — a independência é sobre o comportamento observável (spec.md), não sobre
  arquivos exclusivos por história
- Parar em qualquer checkpoint acima pra validar uma história antes de seguir pra próxima
