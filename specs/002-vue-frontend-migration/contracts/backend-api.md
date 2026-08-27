# Contrato Backend ↔ Frontend

Todos os endpoints abaixo já existem hoje e permanecem com o mesmo formato — o frontend Vue.js
os consome exatamente como o JavaScript puro atual consome. A única adição é `GET /api/rooms`
(marcada como **NOVO**), necessária porque o catálogo de salas deixa de ser embutido no HTML
renderizado pelo servidor (ver [research.md #2](../research.md)). Nenhum endpoint existente muda
de formato, verbo ou path.

## REST

| Método | Path | Request | Response | Usado por |
|---|---|---|---|---|
| **GET** (NOVO) | `/api/rooms` | — | `200` `RoomInfo[]` | boot do app (catálogo inicial), `stores/presence.ts` |
| POST | `/api/rooms` | `RoomCreateRequest` (`id`, `name`, `icon`) | `201` `RoomInfo` \| `409` sala já existe | `ui`/`stores` de administração de sala |
| PUT | `/api/rooms/{roomId}` | `RoomUpdateRequest` (`name`, `icon`) | `200` `RoomInfo` \| `404` | administração de sala (editar) |
| DELETE | `/api/rooms/{roomId}` | — | `204` \| `404` | administração de sala (excluir) |
| GET | `/api/rooms/{roomId}/messages` | query opcional `after` (epoch millis) | `200` `ChatMessageView[]` | carga inicial do histórico de chat; contagem de não lidas (`after` = último timestamp lido) |
| GET | `/api/presence` | — | `200` `Record<string, LiveKitParticipant[]>`, header `X-Presence-Stale` | `stores/presence.ts` (poll periódico da sidebar) |
| GET | `/room/{roomId}/token` | query `identity`, `name` | `200` `{ token, url }` \| `404` sala desconhecida | `stores/voice.ts`, antes de conectar ao LiveKit |

## WebSocket (STOMP sobre SockJS)

| Destino | Direção | Payload | Usado por |
|---|---|---|---|
| `/app/chat/{roomId}` (SEND) | cliente → servidor | `ChatMessageRequest` (`text`, `name`, `stableId`) | `stores/chat.ts`, ao enviar mensagem |
| `/topic/room/{roomId}` (SUBSCRIBE) | servidor → cliente | `ChatMessageView` | `stores/chat.ts`, mensagens novas da sala aberta |
| `/topic/room-catalog` (SUBSCRIBE) | servidor → cliente | `RoomCatalogEvent` (`type`: `created`\|`updated`\|`deleted`, `room`: `RoomInfo`) | `stores/presence.ts` / catálogo global, para manter abas sincronizadas sem reload — **não substitui** o `GET /api/rooms` inicial: só publica a partir do momento em que a assinatura é feita, sem replay do estado atual |

## LiveKit (fora do backend da aplicação)

Após obter `{ token, url }` de `GET /room/{roomId}/token`, o cliente conecta diretamente ao
LiveKit via `livekit-client` (SDP/ICE/mídia nunca passam pelo backend da aplicação — Princípio
III da constituição, inalterado por esta migração).

## Erros

Todos os endpoints REST retornam erros como JSON (nunca a página de erro HTML padrão do Spring),
via `ResponseStatusException` — o frontend pode sempre tentar `res.json()` na resposta de erro
sem checar `Content-Type` primeiro, mesmo comportamento de hoje.
