# Implementation Plan: Modal de escolha de ícone no CRUD de salas

**Branch**: `001-room-icon-picker` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-room-icon-picker/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Trocar a digitação manual de emoji no formulário de sala (`room-form-icon`) por uma modal de
seleção visual: um novo módulo JS (`icon-picker.js`), seguindo o mesmo padrão de
abrir/fechar/backdrop/Escape já usado em `settings-modal.js`, apresenta uma grade estática de
ícones curados construída sem `innerHTML` (via `lib/dom.js`). O `<input id="room-form-icon">`
continua sendo a fonte única de verdade do valor selecionado — a modal só o lê/escreve — o que
preserva de graça o comportamento de ícones legados fora do catálogo (FR-006) e de
cancelar-sem-alterar (FR-008). Não há mudança de contrato de API nem de schema: `Room.icon`
continua texto livre validado só por tamanho.

## Technical Context

**Language/Version**: JavaScript (ES modules nativos do navegador, sem build/bundler) para o
frontend; nenhuma mudança em Java/Spring Boot é necessária para esta funcionalidade.

**Primary Dependencies**: Nenhuma dependência nova. Reaproveita `lib/dom.js` (`el`/`append`/
`clear`/`setClasses`), o componente CSS `.modal`/`.modal__card` já existente em
`css/overlays.css`, e o padrão de módulo de `ui/settings-modal.js` (abrir/fechar, clique no
backdrop, tecla Esc).

**Storage**: N/A — `Room.icon` (Postgres, via `RoomRepository`) não muda; continua texto livre
com `@Size(max = 32)`/`@Column(length = 32)`, sem novo campo nem tabela de catálogo.

**Testing**: Este projeto não tem harness de teste automatizado para o frontend (JS puro sem
framework); a verificação desta funcionalidade é manual, guiada por `quickstart.md`. Nenhum
teste JUnit novo é necessário porque não há mudança de backend.

**Target Platform**: Navegador, mesma origem servida pelo Spring Boot (`shell.html` via
`AppShellController`) — nenhuma plataforma nova.

**Project Type**: Aplicação web de módulo único (Thymeleaf + JS puro na mesma origem do
backend, per Constitution Principle II) — não é uma estrutura "frontend/backend" separada.

**Performance Goals**: Não aplicável além de "abrir/fechar a modal e escolher um ícone parecem
instantâneos" — é uma grade estática de dezenas de botões, sem chamada de rede envolvida na
seleção em si.

**Constraints**: Não introduzir build step, biblioteca externa de emoji picker, nem CDN
(Constitution I e II); não usar `innerHTML` (invariante já imposta por `el()` em `lib/dom.js`,
que lança erro na prop `html`); reaproveitar o componente `.modal` existente em vez de criar um
padrão visual novo para uma única modal.

**Scale/Scope**: Um módulo JS novo pequeno (`icon-picker.js`), uma lista JS estática de ícones
curados (dezenas de emojis, não um charset completo), markup novo dentro de `shell.html`
(reaproveitando `#room-form-modal`), e ajustes de wiring em `app.js`/`room-admin.js`. Sem novo
endpoint, sem migração de banco.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|-----------|-----------|
| I. Minimalismo / YAGNI | **PASS** — zero dependência nova; lista de ícones é uma constante JS estática, não um picker de emoji genérico nem um catálogo configurável no backend (ver spec Assumptions). |
| II. Monólito de Origem Única | **PASS** — continua Thymeleaf + JS puro na mesma origem; nenhum build/SPA/CORS introduzido. |
| III. Mídia sempre via SFU | **N/A** — funcionalidade não toca áudio/vídeo/LiveKit. |
| IV. Documentação da Decisão | **PASS COM NOTA** — não é uma decisão arquitetural nova (é uma melhoria de UX sobre um fluxo já documentado em `docs/projeto/frontend.md`), mas por coerência com o princípio, a implementação deve acrescentar um parágrafo curto ali descrevendo o catálogo de ícones client-side (ver Project Structure abaixo). |
| V. Fases Explícitas | **PASS** — refina o CRUD de salas, que já é uma fase em andamento (não antecipa nenhuma fase futura do README). |

Nenhuma violação → tabela de Complexity Tracking não é necessária.

## Project Structure

### Documentation (this feature)

```text
specs/001-room-icon-picker/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

Sem `contracts/`: nenhum endpoint novo nem mudança de payload é introduzida (ver FR-010) — os
contratos existentes (`POST/PUT/DELETE /api/rooms`) já estão documentados em
[`docs/projeto/backend.md`](../../docs/projeto/backend.md) e permanecem inalterados.

### Source Code (repository root)

```text
# Aplicação web de módulo único (Constitution Principle II) — sem pasta frontend/ separada.
src/main/java/com/nullpointertalk/room/   # inalterado (RoomController, Room, RoomCreateRequest, ...)

src/main/resources/
├── templates/
│   └── shell.html                # markup da modal #room-form-modal ganha a grade de ícones
├── static/css/
│   └── overlays.css               # novo bloco de estilo pra grade de ícones (component .modal já existe)
└── static/js/
    ├── app.js                     # wiring do novo módulo, ao lado de initRoomAdmin/initSettingsModal
    ├── lib/
    │   └── dom.js                 # reaproveitado (el/append/clear), sem mudança
    └── ui/
        ├── room-admin.js          # abre a modal de ícone a partir do formulário existente
        └── icon-picker.js         # NOVO — módulo da modal de seleção (catálogo + open/close)

docs/projeto/frontend.md            # ganha um parágrafo curto sobre o catálogo de ícones (Constitution IV)
```

**Structure Decision**: Módulo único (Constitution Principle II) — sem `frontend/`/`backend/`
separados. A funcionalidade fica inteira em `src/main/resources/{templates,static}` mais um
novo módulo `ui/icon-picker.js`, espelhando como `ui/settings-modal.js` já isola uma modal
própria em vez de inchar `room-admin.js`. Nenhum arquivo em `src/main/java` muda.

## Complexity Tracking

> Não aplicável — Constitution Check não encontrou violações a justificar.

## Post-Design Constitution Check

*Re-check após Phase 1 (`research.md`, `data-model.md`, `quickstart.md`).*

Nenhuma decisão de design (módulo `icon-picker.js` dedicado, catálogo estático client-side,
`#room-form-icon` como fonte única de verdade, construção via `el()`/`append()`) introduziu
dependência nova, endpoint novo, mudança de schema ou desvio dos princípios da constituição —
as avaliações da tabela acima permanecem válidas sem alteração. O único item de acompanhamento
é a nota de documentação (Princípio IV): acrescentar o parágrafo em
`docs/projeto/frontend.md` durante a implementação, não durante o planejamento.
