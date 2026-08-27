# Data Model: Migração do Frontend para Vue.js

Esta migração não introduz novas entidades de domínio — Room, Participant e ChatMessage já
existem no backend e não mudam. O que muda é a camada que os consome: os tipos abaixo são as
representações TypeScript, do lado do frontend, dos mesmos contratos já expostos pelo backend
(ver [contracts/backend-api.md](contracts/backend-api.md)), organizadas pelas stores Pinia que
vão consumi-las.

## RoomInfo (store `stores/presence.ts` + `stores/chat.ts`, catálogo global)

Espelha `RoomInfo` (backend). Fonte: `GET /api/rooms` no boot, atualizado depois via eventos
`room-catalog` do STOMP.

| Campo  | Tipo     | Origem                                    |
|--------|----------|--------------------------------------------|
| `id`   | `string` | slug da sala, também usado na URL e nos tópicos STOMP |
| `name` | `string` | nome de exibição da sala                  |
| `icon` | `string` | id do ícone (mesmo catálogo do sprite SVG hoje em `fragments/icons.html`) |

## ChatMessageView (store `stores/chat.ts`)

Espelha `ChatMessageView` (backend). Fonte: `GET /api/rooms/{roomId}/messages` (carga inicial) e
tópico STOMP `/topic/room/{roomId}` (mensagens novas).

| Campo       | Tipo     | Notas                                              |
|-------------|----------|-----------------------------------------------------|
| `id`        | `string` | id persistido (MongoDB)                            |
| `roomId`    | `string` |                                                      |
| `stableId`  | `string` | id gerado no cliente, usado para deduplicar eco da própria mensagem enviada |
| `name`      | `string` | nome de exibição de quem enviou, no momento do envio |
| `text`      | `string` | máx. 500 caracteres (validado no backend)           |
| `timestamp` | `number` | epoch millis                                        |

## PresenceSnapshot (store `stores/presence.ts`)

Espelha o `Map<String, List<LiveKitParticipant>>` devolvido por `GET /api/presence`.

```ts
type PresenceSnapshot = Record<string, { identity: string; name: string }[]>;
```

O header `X-Presence-Stale` da resposta vira um campo derivado (`isStale: boolean`) na store, sem
persistir — reflete só a última resposta.

## RoomTokenResponse (composable/api `api/roomToken.ts`, consumido por `stores/voice.ts`)

Espelha o corpo JSON de `GET /room/{roomId}/token`.

| Campo   | Tipo     | Notas                                  |
|---------|----------|------------------------------------------|
| `token` | `string` | JWT de acesso ao LiveKit, de uso único por sessão de conexão |
| `url`   | `string` | URL do servidor LiveKit (`livekit.url`)  |

## Identity / preferências (store `stores/identity.ts`, sem backend — `localStorage`)

Estado client-only, sem contraparte no backend — mesma chave/formato hoje usado por
`core/identity.js` e `lib/prefs.js`, preservado por FR-007/edge case da spec (preferências
existentes continuam válidas após a migração).

| Campo         | Tipo      | Notas                                                    |
|---------------|-----------|-----------------------------------------------------------|
| `displayName` | `string`  | nome escolhido no overlay de entrada                      |
| `stableUserId`| `string`  | id estável gerado no primeiro acesso, usado como `identity` do LiveKit e `stableId` do chat |
| `micEnabled`  | `boolean` | preferência de mic ao entrar numa sala                    |
| `cameraEnabled` | `boolean` | preferência de câmera ao entrar numa sala               |

## Relações entre stores

- `stores/identity.ts` não depende de nenhuma outra store — é lida por `stores/voice.ts` (para
  gerar o token) e por `stores/chat.ts` (para preencher `name`/`stableId` ao publicar mensagem).
- `stores/presence.ts` é populada a partir do catálogo de `RoomInfo` (boot) e do polling de
  `GET /api/presence` — não depende de `stores/voice.ts` (presença de *outras* salas é sempre via
  polling; só a sala em que o próprio usuário está usa eventos do LiveKit em tempo real, hoje já
  assim em `core/voice-session.js`).
- `stores/chat.ts` depende de `stores/identity.ts` (para publicar) e é populada por
  `GET /api/rooms/{roomId}/messages` + STOMP, sem depender de `stores/presence.ts` ou
  `stores/voice.ts`.
