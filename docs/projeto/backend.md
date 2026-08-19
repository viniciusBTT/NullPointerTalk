# Backend

Spring Boot 4.1.0, Java 21, Maven. Ver dependências completas em [`pom.xml`](../../pom.xml).

Repositório único, sem subpasta `backend/`: o Maven roda direto na raiz, e esse mesmo projeto serve as páginas (Thymeleaf), os estáticos (CSS/JS puro) e o WebSocket de sinalização — não há um processo de frontend separado. Ver [`docs/projeto/frontend.md`](frontend.md) para a parte de templates/JS.

## Estado atual (WebRTC áudio/vídeo/tela via LiveKit, sem chat/persistência ainda)

```
src/main/java/com/nullpointertalk/
  BackendApplication.java
  livekit/
    LiveKitTokenService.java      # monta o JWT de acesso do LiveKit (HMAC-SHA256, à mão)
  room/
    RoomInfo.java                 # record: id, name, icon
    RoomCatalog.java              # salas fixas, definidas no código (sem CRUD/persistência)
    HomeController.java           # GET /  -> home.html
    RoomController.java           # GET /room/{roomId} -> room.html; GET /room/{roomId}/token -> {token, url}
src/main/resources/
  application.properties
  application-vps.properties      # perfil vps: livekit.url/api-key/api-secret apontando pra VPS
  templates/  (ver docs/projeto/frontend.md)
  static/     (ver docs/projeto/frontend.md)
```

`application.properties` tem as conexões com Postgres/MongoDB e o LiveKit (`livekit.url`, `livekit.api-key`, `livekit.api-secret`) configurados, mas **a autoconfiguração de JPA e MongoDB está desligada** (`spring.autoconfigure.exclude=...`) — como ainda não há entidades (`Room`/`Participant`/`ChatMessage`), não faz sentido o Spring tentar abrir conexão com os bancos no boot. Isso será revertido quando o chat (STOMP + MongoDB) entrar.

**Nota Spring Boot 4.1**: os pacotes de autoconfiguração foram reorganizados por módulo nessa versão — por exemplo `HibernateJpaAutoConfiguration` mudou de `org.springframework.boot.autoconfigure.orm.jpa` para `org.springframework.boot.hibernate.autoconfigure`, e `MongoAutoConfiguration`/`JpaRepositoriesAutoConfiguration` também mudaram de pacote e (no caso do Mongo) de artefato. Vale conferir o pacote real (`unzip -l` no jar em `~/.m2`) antes de usar `spring.autoconfigure.exclude` com versões novas do Boot.

## Emissão de token do LiveKit (`GET /room/{roomId}/token`)

`RoomController` recebe `identity` (peerId gerado no client via `crypto.randomUUID()`) e `name` via query string, valida que a sala existe no `RoomCatalog` e devolve `{token, url}`. `token` é um JWT HS256 montado por `LiveKitTokenService` com um "video grant" (`room`, `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`) - o backend nunca vê SDP/ICE/mídia, isso é tudo negociado depois, direto entre o navegador e o LiveKit.

Ver [`docs/projeto/arquitetura.md`](arquitetura.md) e [`docs/conceito/webrtc.md`](../conceito/webrtc.md) (que ainda documenta o design mesh P2P anterior, como material de estudo).

## Próxima fase (não implementada ainda)

- **`chat/`** — `ChatController` (`@MessageMapping`/`@SendTo`), `ChatMessage` (documento MongoDB), `ChatMessageRepository`. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).
- Persistência de `Room`/`Participant` no Postgres, se fizer sentido nesse ponto. Ver [`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md).
- Reverter o `spring.autoconfigure.exclude` acima quando isso entrar.

## Dependências principais

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-webmvc` | Controllers que renderizam os templates (`HomeController`, `RoomController`) |
| `spring-boot-starter-thymeleaf` | Motor de template server-side (`home.html`, `room.html`) |
| `spring-boot-starter-websocket` | Não usado ainda pela sinalização WebRTC (isso agora é todo LiveKit) - mantido pro chat via STOMP, na próxima fase |
| `spring-boot-starter-data-jpa` + `postgresql` | ORM/driver para Postgres (autoconfig desligada por enquanto — ver acima) |
| `spring-boot-starter-data-mongodb` | Persistência de `ChatMessage` (autoconfig desligada por enquanto — ver acima) |
| `spring-boot-starter-validation` | Validação de DTOs (fase do chat) |
| `lombok` | Reduz boilerplate |
| `devtools` | Live reload em dev |

## Rodar localmente

```bash
docker compose up -d livekit   # servidor de mídia (LiveKit), uma vez só
./mvnw spring-boot:run          # sobe em :8080
```

Quando o chat (STOMP + MongoDB) entrar, o `docker compose up -d` também vai precisar subir Postgres/Mongo.

## Testando via túnel (ngrok e afins)

`server.forward-headers-strategy=native` em `application.properties` é necessário pra isso funcionar - sem ele o Spring vê o request como `http` mesmo quando o navegador fala `https` com o túnel/proxy, gerando URLs/paginas erradas atrás de TLS terminado na frente.

Isso resolve a parte de servir a página e emitir o token. A conexão de mídia (`livekit-client` -> LiveKit) é **separada** e não passa pelo backend Java - o cliente conecta direto na `livekit.url`. Ngrok tuneliza bem WebSocket/HTTPS (a sinalização do LiveKit), mas a mídia em si é UDP puro, que ngrok não encaminha - então uma chamada de verdade entre duas pessoas só funciona apontando `livekit.url` pra um LiveKit acessível publicamente (VPS com porta UDP aberta), não por trás de um túnel ngrok. Ver [`docs/projeto/arquitetura.md`](arquitetura.md#deploy-na-vps-livekit--nginx--tls).
