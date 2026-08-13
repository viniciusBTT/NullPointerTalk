# Frontend

React 19 + Vite + TypeScript. Ver dependências completas em [`frontend/package.json`](../../frontend/package.json).

## Estado atual

Scaffold padrão do Vite (`App.tsx`, `main.tsx`) mais a estrutura de pastas já criada e vazia, pronta para receber as features:

```
frontend/src/
  features/
    media/        # vazio ainda
    signaling/    # vazio ainda
    chat/         # vazio ainda
  store/          # vazio ainda
  pages/          # vazio ainda
```

## Estrutura planejada

- **`features/media/`**
  - `useLocalMedia` — chama `getUserMedia`/`getDisplayMedia`, gerencia o stream local
  - `usePeerConnection` — cria e gerencia o `RTCPeerConnection` (mesh P2P), registra `onicecandidate` e `ontrack`
  - (ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md))
- **`features/signaling/`**
  - wrapper do WebSocket nativo do browser para trocar offer/answer/ICE com o backend (`/ws/signaling`)
  - (ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md))
- **`features/chat/`**
  - wrapper do cliente STOMP (`@stomp/stompjs` + `sockjs-client`) conectando em `/ws/chat`
  - slice de mensagens
  - (ver [`docs/conceito/stomp.md`](../conceito/stomp.md))
- **`store/`**
  - store do Redux Toolkit — slices de `room`, `participants`, `chat`, `media`
- **`pages/`**
  - `Home` — criar/entrar em sala
  - `Room` — tela de vídeo + chat

## Dependências principais

Runtime:
| Pacote | Propósito |
|---|---|
| `react`, `react-dom` | Base |
| `react-router-dom` | Navegação Home ↔ Room |
| `@reduxjs/toolkit`, `react-redux` | Estado global |
| `@stomp/stompjs`, `sockjs-client` | Cliente STOMP para o chat |

Dev:
| Pacote | Propósito |
|---|---|
| `vite`, `@vitejs/plugin-react`, `typescript` | Build/tipagem |
| `oxlint` | Lint (padrão atual do template do Vite) |
| `prettier` | Formatação |
| `vitest`, `@testing-library/react` | Testes |

**Nota**: para o WebRTC em si (mesh P2P), não há dependência externa (ex: simple-peer) — usamos `RTCPeerConnection` nativo do browser diretamente, que é o ponto de aprendizado.

## Rodar localmente

```bash
cd frontend && npm install && npm run dev   # sobe em :5173
```
