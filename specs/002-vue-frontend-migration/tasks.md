---

description: "Task list template for feature implementation"
---

# Tasks: Migração do Frontend para Vue.js

**Input**: Design documents de `/specs/002-vue-frontend-migration/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/backend-api.md](contracts/backend-api.md),
[quickstart.md](quickstart.md)

**Tests**: incluídas de forma pontual (Vitest para stores/composables com lógica não trivial —
decisão de `research.md` #5, espelhando a exigência já existente na constituição para o
backend). Não é TDD estrito: os testes de US3 validam lógica já implementada em US1.

**Organization**: tarefas agrupadas por user story (spec.md), para permitir implementação e
validação independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

- **Frontend** (novo): `frontend/src/...` (Vite + Vue 3 + TS + Pinia + Tailwind)
- **Backend** (existente, mono repo): `src/main/java/com/nullpointertalk/...`,
  `src/main/resources/...`
- Ver `plan.md` → Project Structure para a árvore completa

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicializar o projeto `frontend/` e o hook de build no Maven.

- [X] T001 Criar o projeto Vite (template `vue-ts`) em `frontend/`: `frontend/package.json`,
  `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`,
  `frontend/src/main.ts` (placeholder)
- [X] T002 Adicionar dependências ao `frontend/package.json`: produção (`vue`, `vue-router`,
  `pinia`, `@stomp/stompjs`, `livekit-client`) e dev (`tailwindcss`, `@tailwindcss/vite`,
  `vitest`, `@vue/test-utils`, `vue-tsc`) — ver research.md #3, #4
- [X] T003 [P] Criar `frontend/src/assets/main.css` com `@import "tailwindcss";` (research.md #4)
- [X] T004 [P] Configurar `frontend/vite.config.ts`: plugin `@tailwindcss/vite` e proxy de dev
  para `/api`, `/ws` e `/room` apontando para `http://localhost:8080` (research.md #6)
- [X] T005 Adicionar script `"test:unit": "vitest run"` a `frontend/package.json`
- [X] T006 [P] Adicionar `frontend-maven-plugin` ao `pom.xml` (fase `generate-resources`:
  `npm ci` + `npm run build`, versão do Node fixada) e configurar o `maven-resources-plugin`
  para copiar `frontend/dist/**` para `target/classes/static` antes do empacotamento
  (research.md #1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura mínima sem a qual nenhuma user story pode ser validada.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase estar completa.

- [X] T007 Criar `frontend/src/App.vue` (shell vazio) e finalizar `frontend/src/main.ts`
  (`createApp` + `createPinia()` + router)
- [X] T008 [P] Criar `frontend/src/api/http.ts`: cliente `fetch` base com tratamento de erro
  JSON, sem checar `Content-Type` antes de `res.json()` (contracts/backend-api.md → Erros)
- [X] T009 [P] Criar `frontend/src/api/chatSocket.ts`: cliente STOMP/SockJS compartilhado
  (`@stomp/stompjs`), conectado uma vez, expondo `subscribe`/`publish` genéricos
- [X] T010 [P] Criar `frontend/src/stores/identity.ts` (Pinia): `displayName`, `stableUserId`,
  `micEnabled`, `cameraEnabled`, lidos/gravados em `localStorage` na mesma chave/formato de hoje
  (data-model.md → Identity)
- [X] T011 [P] Adicionar `GET /api/rooms` em
  `src/main/java/com/nullpointertalk/room/RoomController.java`, retornando `List<RoomInfo>` via
  `RoomCatalog.all()` (research.md #2, contracts/backend-api.md)
- [X] T012 [P] Simplificar `src/main/java/com/nullpointertalk/room/AppShellController.java`:
  `/` e `/room/{roomId}` passam a `return "forward:/index.html"`, sem `Model`, `roomsJson` nem
  `activeRoom` (research.md #2)
- [X] T013 Criar `frontend/src/stores/presence.ts` (Pinia): catálogo global de salas (carregado
  via `GET /api/rooms` no boot, atualizado por `/topic/room-catalog`) e snapshot de presença
  (`GET /api/presence`, com `isStale` derivado do header `X-Presence-Stale`) — depende de T008,
  T009, T011 (data-model.md → RoomInfo, PresenceSnapshot)
- [X] T014 Criar `frontend/src/router/index.ts` (`vue-router`, modo `history`): rotas `/` e
  `/room/:roomId`, com guard que redireciona para `/` quando o `roomId` não existe no catálogo
  de `stores/presence.ts` (equivalente ao `redirect:/` hoje em `AppShellController`) — depende
  de T007, T013

**Checkpoint**: app Vue sobe vazio em `/` e `/room/:roomId`, catálogo de salas carrega e o guard
de rota funciona — pronto para as user stories.

---

## Phase 3: User Story 1 - Paridade funcional para o usuário final (Priority: P1) 🎯 MVP

**Goal**: réplica completa do comportamento hoje existente no frontend Thymeleaf/JS puro.

**Independent Test**: roteiro manual do `quickstart.md` (§ "Paridade funcional") em duas
abas/navegadores, comparando com o comportamento atual descrito no `README.md`.

### Implementação — identidade, salas e ícones

- [X] T015 [P] [US1] `frontend/src/components/overlays/NameGate.vue`: overlay que pede o nome
  na primeira visita e grava em `stores/identity.ts`
- [X] T016 [P] [US1] `frontend/src/lib/icons.ts` + `frontend/src/components/IconSprite.vue`:
  catálogo de ícones e sprite SVG embutido, substituindo `templates/fragments/icons.html`
- [X] T017 [P] [US1] `frontend/src/components/sidebar/Sidebar.vue` +
  `frontend/src/components/sidebar/ChannelList.vue`: lista de canais a partir de
  `stores/presence.ts`, navegação para `/room/:id`
- [X] T018 [US1] `frontend/src/components/overlays/IconPicker.vue`: seletor de ícone de sala
  (consome `lib/icons.ts` de T016), usado por T019 — depende de T016
- [X] T019 [US1] `frontend/src/components/sidebar/RoomAdminModal.vue`: criar/editar/excluir sala
  (`POST`/`PUT`/`DELETE /api/rooms`), usa `IconPicker.vue` — depende de T017, T018

### Implementação — chat

- [X] T020 [P] [US1] `frontend/src/api/chatHistory.ts`: `GET /api/rooms/{roomId}/messages`
  (com parâmetro opcional `after`)
- [X] T021 [US1] `frontend/src/stores/chat.ts` (Pinia): histórico via T020, envio/recebimento
  via `api/chatSocket.ts` (`/app/chat/{roomId}`, `/topic/room/{roomId}`), deduplicação de eco
  da própria mensagem por `stableId` — depende de T009, T010, T020
- [X] T022 [US1] `frontend/src/components/chat/ChatPanel.vue`: lista de mensagens + composer,
  consome `stores/chat.ts` — depende de T021

### Implementação — voz, vídeo e compartilhamento de tela

- [X] T023 [P] [US1] `frontend/src/api/roomToken.ts`: `GET /room/{roomId}/token`
- [X] T024 [P] [US1] `frontend/src/composables/useLocalMedia.ts`: `getUserMedia`, liga/desliga
  mic/câmera
- [X] T025 [P] [US1] `frontend/src/composables/useScreenShare.ts`: `getDisplayMedia`
- [X] T026 [P] [US1] `frontend/src/composables/useAudioSink.ts`: reprodução das faixas de áudio
  remotas
- [X] T027 [US1] `frontend/src/stores/voice.ts` (Pinia): conecta ao LiveKit via
  `livekit-client`, token de `api/roomToken.ts`, expõe participantes/tracks/estado da conexão —
  depende de T023, T024, T025, T026
- [X] T028 [P] [US1] `frontend/src/components/stage/ParticipantTile.vue`: vídeo/avatar/badges de
  mic-câmera de um participante
- [X] T029 [P] [US1] `frontend/src/components/stage/Stage.vue`: grid de tiles, consome
  `stores/voice.ts` — depende de T027, T028
- [X] T030 [P] [US1] `frontend/src/components/sidebar/VoicePanel.vue`: status do canal de voz
  atual, entrar/sair — depende de T027
- [X] T031 [P] [US1] `frontend/src/components/stage/ParticipantPopover.vue`: menu ao clicar num
  participante — depende de T027
- [X] T032 [P] [US1] `frontend/src/components/overlays/SettingsModal.vue`: preferências de
  mic/câmera, grava em `stores/identity.ts` — depende de T010

### Implementação — feedback e montagem final

- [X] T033 [P] [US1] `frontend/src/composables/useSounds.ts`: sons de entrada/saída de
  participante
- [X] T034 [P] [US1] `frontend/src/composables/useUiFeedback.ts` +
  `frontend/src/components/overlays/ToastHost.vue`: toasts e banners
- [X] T035 [US1] `frontend/src/composables/useBrowserSupport.ts`: detecta na inicialização se o
  navegador suporta os recursos exigidos (WebRTC/`getUserMedia`, WebSocket), exibindo uma
  mensagem de erro compreensível via `useUiFeedback`/`ToastHost.vue` em vez de tela em
  branco/travada (spec.md → Edge Cases) — depende de T034
- [X] T036 [P] [US1] `frontend/src/assets/main.css`: portar os tokens visuais de
  `static/css/tokens.css` (cores, espaçamentos, tipografia) para o tema Tailwind
- [X] T037 [US1] `frontend/src/App.vue`: montar `NameGate`, `Sidebar`, `Stage`, `ChatPanel`,
  `VoicePanel` e os modais/overlays; ativar a sala corrente a partir da rota — depende de
  T015, T018, T019, T022, T029, T030, T031, T032, T034, T035
- [X] T038 [US1] Remover `src/main/resources/templates/shell.html`,
  `src/main/resources/templates/fragments/icons.html`, `src/main/resources/static/js/**` e
  `src/main/resources/static/css/**` (cutover final — tudo já portado) — depende de T037

**Checkpoint**: rodando `frontend/` (dev ou build), todos os fluxos do roteiro de paridade do
`quickstart.md` funcionam sem o antigo Thymeleaf/JS puro.

---

## Phase 4: User Story 2 - Ciclo de desenvolvimento mais rápido (Priority: P2)

**Goal**: hot-reload real ao editar a UI, sem refresh manual completo.

**Independent Test**: alterar um componente em `frontend/src/components/` com `npm run dev`
rodando e medir o tempo até a mudança aparecer no navegador (`quickstart.md` § SC-002).

- [X] T039 [P] [US2] Configurar ESLint + Prettier em `frontend/` (`eslint.config.ts`,
  `.prettierrc`) para feedback rápido de erro durante o dev
- [X] T040 [US2] Adicionar script `"typecheck": "vue-tsc --noEmit"` a `frontend/package.json` e
  confirmar que roda sem erros sobre o código de US1
- [X] T041 [US2] Validar manualmente que o HMR do Vite preserva o estado das stores Pinia ao
  editar um componente (ajustar `frontend/vite.config.ts` se necessário) — depende de T037
  (app funcional de US1), checkpoint de SC-002

**Checkpoint**: `npm run dev` com hot-reload sub-2s validado contra SC-002.

---

## Phase 5: User Story 3 - Estado de UI centralizado e reutilizável (Priority: P3)

**Goal**: estado compartilhado (chat, presença, voz) lido/alterado num único lugar, sem
duplicação entre componentes.

**Independent Test**: inspecionar `stores/chat.ts`/`stores/presence.ts` e confirmar que
componentes distintos (ex.: badge de não lidas na sidebar e contador no `ChatPanel`) derivam do
mesmo estado, sem lógica de sincronização duplicada.

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] `frontend/tests/unit/stores/chat.spec.ts` (Vitest): deduplicação de eco por
  `stableId` e cálculo de `unreadCount`
- [X] T043 [P] [US3] `frontend/tests/unit/stores/presence.spec.ts` (Vitest): reconciliação do
  catálogo de salas e da presença ao entrar/sair participante
- [X] T044 [P] [US3] `frontend/tests/unit/stores/voice.spec.ts` (Vitest): transições de estado
  da sessão de voz (conectar/desconectar/erro)

### Implementation for User Story 3

- [X] T045 [US3] `frontend/src/stores/chat.ts`: expor `unreadCount` computed (mensagens após o
  último timestamp lido, salvo via `stores/identity.ts`), consumido por `Sidebar.vue` (badge) e
  `ChatPanel.vue` (contador) sem lógica duplicada — acceptance scenario da spec (US3) — depende
  de T021, T042
- [X] T046 [US3] Revisar `Sidebar.vue`, `ChatPanel.vue`, `Stage.vue` e `VoicePanel.vue`
  garantindo que nenhum componente mantém cópia local de estado já existente numa store
  (fonte única de verdade); ajustar onde necessário — depende de T037, T045

**Checkpoint**: stores cobertas por teste unitário; nenhum estado duplicado entre componentes.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentação e validação final, cobrindo todas as user stories.

- [X] T047 [P] Atualizar `docs/projeto/frontend.md` registrando a migração, a nova estrutura de
  `frontend/` e as decisões de `research.md` (FR-009, Princípio IV da constituição)
- [X] T048 [P] Atualizar `README.md` (seções "Arquitetura" e "Como rodar") para refletir
  Vue.js + TypeScript + Pinia + Vite + Tailwind CSS e o fluxo de dev de dois processos
  (backend + `npm run dev`)
- [X] T049 Rodar o roteiro completo de `quickstart.md` (dev, build de produção, paridade
  funcional SC-001/SC-002/SC-004/SC-005, desempenho SC-003, edge cases) de ponta a ponta e
  confirmar que todos os passos passam
- [X] T050 [P] Rodar `npm run lint`, `npm run typecheck` e `npm run test:unit` em `frontend/`
  sem erros, como gate final antes de considerar a migração concluída

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Stories (Phase 3-5)**: todas dependem do Foundational
  - US1 é o caminho crítico funcional (a maior parte das telas nasce aqui)
  - US2 e US3 têm tarefas de validação/checkpoint que dependem de US1 estar montada
    (T041 depende de T037; T045-T046 dependem de T037), mas suas tarefas de tooling/config
    (T039, T040, T042-T044) podem começar em paralelo assim que o Foundational termina
- **Polish (Phase 6)**: depende de US1, US2 e US3 completas

### User Story Dependencies

- **US1 (P1)**: depende só do Foundational
- **US2 (P2)**: tooling (T039, T040) independe de US1; validação de HMR (T041) depende de US1
  estar montada (T037) para ter algo significativo para editar
- **US3 (P3)**: testes de store (T042-T044) podem rodar assim que a store correspondente de US1
  existir (T021 chat, T013 presence, T027 voice); a tarefa de `unreadCount` (T045) e a revisão
  de duplicação de estado (T046) dependem de US1 completa (T037)

### Parallel Opportunities

- Setup: T003, T004, T006 em paralelo entre si (após T002)
- Foundational: T008, T009, T010, T011, T012 em paralelo entre si (após T007/T001)
- US1: T015, T016, T017 em paralelo; depois T023-T026 em paralelo; depois T028, T030, T031,
  T032, T033, T036 em paralelo (todas dependem só de tarefas já concluídas, não umas das
  outras); T035 depende de T034
- US3: T042, T043, T044 em paralelo entre si

---

## Parallel Example: Foundational

```bash
# Após T001 (scaffold) e T007 (main.ts/App.vue), em paralelo:
Task: "Criar frontend/src/api/http.ts"
Task: "Criar frontend/src/api/chatSocket.ts"
Task: "Criar frontend/src/stores/identity.ts"
Task: "Adicionar GET /api/rooms em RoomController.java"
Task: "Simplificar AppShellController.java para forward:/index.html"
```

## Parallel Example: User Story 1 (mídia)

```bash
# Depois de T022 (api/roomToken.ts) pronto, em paralelo:
Task: "composables/useLocalMedia.ts"
Task: "composables/useScreenShare.ts"
Task: "composables/useAudioSink.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia tudo)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: rodar o roteiro de paridade funcional do `quickstart.md`
5. Neste ponto o frontend antigo já foi removido (T038) — o MVP É a migração completa do
   ponto de vista do usuário final, mesmo sem US2/US3

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → validar paridade funcional → frontend antigo removido (MVP entregue)
3. US2 → validar ciclo de hot-reload (ganho de produtividade, não bloqueia uso da aplicação)
4. US3 → cobertura de teste + revisão de duplicação de estado (qualidade/manutenibilidade)
5. Polish → documentação e gate final

### Notes

- Como esta migração substitui o frontend de uma vez (spec.md → Assumptions), US2 e US3 não são
  "features" que o usuário final percebe isoladamente — são propriedades de qualidade do mesmo
  código entregue em US1, por isso suas tarefas de validação dependem de US1 estar montada.
- Commitar após cada tarefa ou grupo lógico de tarefas relacionadas.
- Parar em qualquer checkpoint para validar a story correspondente antes de seguir.
