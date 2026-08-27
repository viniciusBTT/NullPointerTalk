# Implementation Plan: Migração do Frontend para Vue.js

**Branch**: `002-vue-frontend-migration` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-vue-frontend-migration/spec.md`

## Summary

Substituir o frontend atual (Thymeleaf + JavaScript puro em `src/main/resources/{templates,static}`)
por uma aplicação Vue.js 3 + TypeScript + Pinia + Tailwind CSS, buildada com Vite num novo
diretório `frontend/` na raiz do mono repo. Em produção, o build do Vite é integrado ao ciclo de
vida do Maven e seu resultado passa a ser servido pelo próprio Spring Boot como recurso estático
— preservando a origem única em runtime (Princípio II da constituição, emendado para permitir
esta migração). Em desenvolvimento, o Vite roda como servidor dedicado com hot-reload,
proxiando chamadas de API/WebSocket para o backend, sem alterar nenhum contrato REST/STOMP hoje
existente.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Vue 3.5 (Composition API, `<script setup>`); backend
permanece Java 21 / Spring Boot, inalterado.

**Primary Dependencies**: `vue`, `vue-router`, `pinia`, `vite`, `@tailwindcss/vite` (Tailwind
CSS v4), `@stomp/stompjs`, `livekit-client` (via npm, substituindo os arquivos hoje vendorizados
em `static/js/vendor`); no backend, `frontend-maven-plugin` para integrar o build do frontend ao
Maven.

**Storage**: N/A no frontend — dados continuam persistidos no backend (PostgreSQL via JPA,
MongoDB para histórico de chat), sem alteração. `localStorage` do navegador continua guardando
identidade/preferências do usuário, mesma chave/formato de hoje (FR-007, edge case da spec).

**Testing**: Vitest + `@vue/test-utils` para stores Pinia e composables com lógica não trivial
(ex.: reconciliação de presença, estado de sessão de voz/chat) — mesmo padrão já exigido pela
constituição para services/controllers no backend, aplicado ao equivalente de frontend. Validação
end-to-end dos fluxos de usuário é manual, via `quickstart.md` (SC-001).

**Target Platform**: navegador web moderno (desktop), mesmo alvo de hoje — ES2020+, WebRTC.

**Project Type**: web application — mono repo com backend Spring Boot na raiz (inalterado) e novo
diretório `frontend/` (projeto Vite) cujo build de produção é embutido no artefato do backend.

**Performance Goals**: tempo até interatividade da página não piora frente à versão atual
(SC-003); ciclo de hot-reload em dev abaixo de 2s entre salvar e ver a mudança (SC-002).

**Constraints**: origem única em runtime — sem CORS multi-origem em produção (FR-005); build de
produção quebrado NÃO pode subir versão parcial (edge case da spec); nenhum framework de UI além
de Vue é introduzido (YAGNI).

**Scale/Scope**: aplicação de página única (shell + salas de voz/chat), mesmo escopo funcional do
frontend atual — sem novas telas ou funcionalidades de produto.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Minimalismo/YAGNI**: PASS. Dependências adicionadas (`vue`, `pinia`, `vue-router`, Vite,
  Tailwind) resolvem a necessidade real declarada pelo usuário para esta fase (migração de
  frontend), não uma necessidade hipotética. `vue-router` é o equivalente idiomático do
  `core/router.js` atual, não uma adição especulativa. Nenhuma suíte E2E automatizada é
  introduzida nesta fase (ver research.md #5) — evita complexidade que a fase atual não pede.
- **II. Mono Repo com Backend como Origem Única em Runtime**: PASS (após emenda da constituição
  para v2.0.0). O build do frontend é integrado ao ciclo do Maven; em produção só o Spring Boot
  é servido, a partir da mesma origem — ver research.md #1.
- **III. Mídia sempre via SFU self-hosted**: PASS. `livekit-client` continua sendo a única
  biblioteca a lidar com SDP/ICE/mídia; o backend continua só emitindo tokens
  (`LiveKitTokenService`, endpoint `/room/{roomId}/token`), sem alteração de contrato.
- **IV. Documentação da decisão antes/junto da implementação**: satisfeito via FR-009 —
  `docs/projeto/frontend.md` é atualizado como parte das tasks desta migração (Polish phase),
  registrando a nova estrutura e as decisões deste plano.
- **V. Fases explícitas**: PASS. Esta migração É a fase explicitamente pedida pelo usuário; não
  antecipa nenhuma outra funcionalidade fora de escopo (spec.md → Assumptions).
- **Governança / idioma pt-BR**: todos os artefatos deste Spec Kit (spec, plan, research,
  data-model, quickstart, tasks) estão em português brasileiro, conforme exigido.

Nenhuma violação a justificar — seção "Complexity Tracking" omitida.

**Re-check pós-Fase 1**: o único ponto de design que toca o backend é a adição de
`GET /api/rooms` (research.md #2, contracts/backend-api.md) — mesma origem, mesmo módulo Maven,
sem autenticação nova, sem CORS. Gates permanecem PASS sem mudança de avaliação.

## Project Structure

### Documentation (this feature)

```text
specs/002-vue-frontend-migration/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (/speckit-plan)
├── data-model.md         # Fase 1 (/speckit-plan)
├── quickstart.md         # Fase 1 (/speckit-plan)
├── contracts/
│   └── backend-api.md    # Fase 1 (/speckit-plan) — contratos REST/STOMP já existentes, consumidos pelo frontend sem alteração
└── tasks.md               # Fase 2 (/speckit-tasks) — não criado por este comando
```

### Source Code (repository root)

```text
frontend/                            # novo projeto Vite (Vue 3 + TS + Pinia + Tailwind)
├── src/
│   ├── main.ts                      # bootstrap: cria app Vue, Pinia, Vue Router
│   ├── App.vue                      # shell (equivalente a shell.html)
│   ├── router/
│   │   └── index.ts                 # rotas "/" e "/room/:roomId" (equivalente a core/router.js)
│   ├── stores/                      # Pinia — substitui core/{chat-store,presence,voice-session,identity}.js
│   │   ├── chat.ts
│   │   ├── presence.ts
│   │   ├── voice.ts
│   │   └── identity.ts
│   ├── components/                  # substitui ui/*.js (sidebar, chat, stage, tile, voice-panel,
│   │   │                            #   settings-modal, participant-popover, name-gate, room-admin, icon-picker)
│   │   ├── sidebar/
│   │   ├── stage/
│   │   ├── chat/
│   │   └── overlays/
│   ├── composables/                 # substitui lib/{media,screenshare,sounds,ui-feedback,avatar,prefs}.js
│   ├── api/                         # clientes REST/STOMP (ver contracts/backend-api.md)
│   │   ├── rooms.ts
│   │   ├── chatHistory.ts
│   │   ├── presence.ts
│   │   ├── roomToken.ts
│   │   └── chatSocket.ts
│   └── assets/
│       └── main.css                 # `@import "tailwindcss";`
├── index.html                        # entry point do Vite (substitui templates/shell.html)
├── vite.config.ts                    # proxy /api, /ws, /room/*/token → localhost:8080 em dev
├── tsconfig.json
└── package.json

src/main/java/com/nullpointertalk/room/
├── AppShellController.java           # simplificado: `/` e `/room/{roomId}` passam a fazer forward
│                                      #   para o index.html buildado, em vez de renderizar Thymeleaf
│                                      #   (ver research.md #2)
└── RoomController.java                # + GET /api/rooms (novo — ver research.md #2); PUT/POST/DELETE
                                       #   inalterados. ChatHistoryController, PresenceController,
                                       #   RoomTokenController, ChatController permanecem inalterados
                                       #   (contrato já consumido pelo frontend sem mudanças)

src/main/resources/
├── static/                           # passa a ser gerado pelo build do frontend (frontend/dist) —
│                                      #   não editado manualmente; static/js e static/css atuais são removidos
└── templates/                        # shell.html e fragments/icons.html removidos (sprite de ícones
                                       #   passa a viver em frontend/src)

pom.xml                                # adiciona frontend-maven-plugin (ver research.md #1)
```

**Structure Decision**: mono repo com um novo diretório `frontend/` na raiz — projeto Vite
independente para desenvolvimento (dev server próprio com proxy para o backend) — cujo build de
produção (`frontend/dist`) é copiado para `src/main/resources/static` pelo próprio `mvn package`
(via `frontend-maven-plugin`), preservando o Princípio II: só o processo Spring Boot é servido em
produção, a partir de uma única origem. O backend continua sendo o módulo Maven na raiz do
repositório, sem mover para uma subpasta `backend/`.
