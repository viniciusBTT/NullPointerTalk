# Backend

Spring Boot 4.1.0, Java 21, Maven. Ver dependências completas em [`backend/pom.xml`](../../backend/pom.xml).

## Estado atual

Só o scaffold gerado pelo Spring Initializr existe por enquanto:

```
backend/src/main/java/com/nullpointertalk/BackendApplication.java
backend/src/main/resources/application.properties
backend/src/test/java/com/nullpointertalk/BackendApplicationTests.java
```

`application.properties` já tem as conexões com Postgres e MongoDB configuradas, e um placeholder de ICE servers (`webrtc.ice-servers[0].urls=stun:...`) — mas nenhum código de sinalização, chat ou persistência foi escrito ainda.

## Pacotes planejados

Conforme desenhado em `docs/projeto/arquitetura.md`, a organização prevista é por área de domínio (`com.nullpointertalk.<área>`):

- **`config/`**
  - `WebSocketConfig` — registra o handler raw de sinalização no endpoint `/ws/signaling`
  - `StompConfig` — `@EnableWebSocketMessageBroker`, endpoint `/ws/chat` com SockJS, broker em memória para `/topic` e `/queue`
- **`signaling/`**
  - `SignalingWebSocketHandler` — relay de mensagens `offer`/`answer`/`ice-candidate` entre peers da mesma sala; registro de sessões por `roomId` em memória (ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md))
- **`chat/`**
  - `ChatController` (`@MessageMapping`/`@SendTo`)
  - `ChatMessage` — documento MongoDB
  - `ChatMessageRepository` — `MongoRepository`
  - (ver [`docs/conceito/stomp.md`](../conceito/stomp.md))
- **`room/`**
  - `Room`, `Participant` — entidades JPA/Postgres
  - `RoomController` — REST: criar sala, listar salas, entrar/sair
  - (ver [`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md))

## Dependências principais

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-webmvc` | REST endpoints (salas, participantes) |
| `spring-boot-starter-websocket` | Base para WebSocket puro (sinalização) e STOMP (chat) |
| `spring-boot-starter-data-jpa` + `postgresql` | ORM/driver para Postgres |
| `spring-boot-starter-data-mongodb` | Persistência de `ChatMessage` |
| `spring-boot-starter-validation` | Validação de DTOs |
| `lombok` | Reduz boilerplate |
| `devtools` | Live reload em dev |

## Rodar localmente

```bash
docker compose up -d              # Postgres + Mongo (na raiz do monorepo)
cd backend && ./mvnw spring-boot:run   # sobe em :8080
```
