# Backend

Spring Boot 4.1.0, Java 21, Maven. Ver dependências completas em [`pom.xml`](../../pom.xml).

Repositório único, sem subpasta `backend/`: o Maven roda direto na raiz, e esse mesmo projeto serve as páginas (Thymeleaf), os estáticos (CSS/JS puro) e o WebSocket de sinalização — não há um processo de frontend separado. Ver [`docs/projeto/frontend.md`](frontend.md) para a parte de templates/JS.

## Estado atual (fase 1: WebRTC áudio/vídeo/tela, sem chat/persistência ainda)

```
src/main/java/com/nullpointertalk/
  BackendApplication.java
  config/
    WebSocketConfig.java          # registra SignalingWebSocketHandler em /ws/signaling
  room/
    RoomInfo.java                 # record: id, name, icon
    RoomCatalog.java              # salas fixas, definidas no código (sem CRUD/persistência)
    HomeController.java           # GET /  -> home.html
    RoomController.java           # GET /room/{roomId} -> room.html (404/redirect se sala não existe)
  signaling/
    SignalingWebSocketHandler.java  # relay de offer/answer/ice-candidate entre peers da mesma sala
src/main/resources/
  application.properties
  templates/  (ver docs/projeto/frontend.md)
  static/     (ver docs/projeto/frontend.md)
```

`application.properties` tem as conexões com Postgres/MongoDB e o ICE server (`webrtc.ice-servers[0].urls`) configurados, mas **a autoconfiguração de JPA e MongoDB está desligada** (`spring.autoconfigure.exclude=...`) — como ainda não há entidades (`Room`/`Participant`/`ChatMessage`), não faz sentido o Spring tentar abrir conexão com os bancos no boot. Isso será revertido quando o chat (STOMP + MongoDB) entrar.

**Nota Spring Boot 4.1**: os pacotes de autoconfiguração foram reorganizados por módulo nessa versão — por exemplo `HibernateJpaAutoConfiguration` mudou de `org.springframework.boot.autoconfigure.orm.jpa` para `org.springframework.boot.hibernate.autoconfigure`, e `MongoAutoConfiguration`/`JpaRepositoriesAutoConfiguration` também mudaram de pacote e (no caso do Mongo) de artefato. Vale conferir o pacote real (`unzip -l` no jar em `~/.m2`) antes de usar `spring.autoconfigure.exclude` com versões novas do Boot.

## Protocolo de sinalização (`/ws/signaling`)

Sessão identificada via query string: `?roomId=...&peerId=...&name=...` (peerId gerado no client via `crypto.randomUUID()`).

- Ao conectar: o servidor manda ao novo peer `{type:"peers", peers:[{peerId,name}, ...]}` (quem já está na sala) e avisa os demais com `{type:"peer-joined", peerId, name}`.
- `offer` / `answer` / `ice-candidate` trazem um campo `to` (peerId alvo) — o handler só repassa para a sessão daquele peer, preenchendo `from`/`name`. Nunca interpreta `sdp`/`candidate`.
- Ao desconectar: `{type:"peer-left", peerId}` para os demais da sala.
- Convenção para evitar oferta dupla (glare): quem acabou de entrar sempre inicia a oferta para os peers já existentes.

Ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md) e [`docs/conceito/webrtc.md`](../conceito/webrtc.md).

## Próxima fase (não implementada ainda)

- **`chat/`** — `ChatController` (`@MessageMapping`/`@SendTo`), `ChatMessage` (documento MongoDB), `ChatMessageRepository`. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).
- Persistência de `Room`/`Participant` no Postgres, se fizer sentido nesse ponto. Ver [`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md).
- Reverter o `spring.autoconfigure.exclude` acima quando isso entrar.

## Dependências principais

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-webmvc` | Controllers que renderizam os templates (`HomeController`, `RoomController`) |
| `spring-boot-starter-thymeleaf` | Motor de template server-side (`home.html`, `room.html`) |
| `spring-boot-starter-websocket` | Base para WebSocket puro (sinalização) e, futuramente, STOMP (chat) |
| `spring-boot-starter-data-jpa` + `postgresql` | ORM/driver para Postgres (autoconfig desligada por enquanto — ver acima) |
| `spring-boot-starter-data-mongodb` | Persistência de `ChatMessage` (autoconfig desligada por enquanto — ver acima) |
| `spring-boot-starter-validation` | Validação de DTOs (fase do chat) |
| `lombok` | Reduz boilerplate |
| `devtools` | Live reload em dev |

## Rodar localmente

```bash
./mvnw spring-boot:run   # sobe em :8080, sem precisar do docker compose nesta fase
```

Quando o chat (STOMP + MongoDB) entrar, vai precisar de:

```bash
docker compose up -d   # Postgres + Mongo (na raiz do monorepo)
```

## Testando via túnel (ngrok e afins)

`server.forward-headers-strategy=native` em `application.properties` é necessário pra isso funcionar. Sem ele, o handshake do WebSocket (`/ws/signaling`) é rejeitado com **403** atrás de qualquer túnel HTTPS (ngrok, cloudflared etc.): o navegador manda `Origin: https://...`, mas o Tomcat via o request como `http` (o túnel fala HTTP puro com o backend local) — e o check de mesma-origem do Spring para WebSocket compara esquema **e** host, não só o host. Com essa propriedade, o Tomcat passa a confiar no `X-Forwarded-Proto`/`X-Forwarded-Host` que o túnel injeta e enxerga o esquema certo. Confirmado via handshake manual simulando os headers que o ngrok injeta (ver histórico do projeto) — origens diferentes continuam corretamente rejeitadas com 403.

Isso resolve só a parte de sinalização/página. A mídia (áudio/vídeo/tela) continua sendo **P2P direto entre os navegadores** — o túnel não participa disso. Com dois participantes em redes diferentes, só STUN público pode não bastar dependendo do tipo de NAT de cada lado (comum em NAT simétrico/firewall corporativo); se a chamada não conectar, a próxima etapa é subir um TURN (`coturn`), já previsto na fase 3.
