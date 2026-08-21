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
    AppShellController.java       # GET /  e  GET /room/{roomId} -> shell.html (o MESMO template)
    RoomTokenController.java      # GET /room/{roomId}/token -> {token, url}
    PresenceController.java       # GET /api/presence -> {roomId: [{identity, name}]}
    PresenceService.java          # agrega a presenca e faz cache (single-flight)
src/main/resources/
  application.properties
  application-vps.properties      # perfil vps: livekit.url/api-key/api-secret apontando pra VPS
  templates/  (ver docs/projeto/frontend.md)
  static/     (ver docs/projeto/frontend.md)
```

`application.properties` tem as conexões com Postgres/MongoDB e o LiveKit (`livekit.url`, `livekit.api-key`, `livekit.api-secret`) configurados, mas **a autoconfiguração de JPA e MongoDB está desligada** (`spring.autoconfigure.exclude=...`) — como ainda não há entidades (`Room`/`Participant`/`ChatMessage`), não faz sentido o Spring tentar abrir conexão com os bancos no boot. Isso será revertido quando o chat (STOMP + MongoDB) entrar.

**Nota Spring Boot 4.1**: os pacotes de autoconfiguração foram reorganizados por módulo nessa versão — por exemplo `HibernateJpaAutoConfiguration` mudou de `org.springframework.boot.autoconfigure.orm.jpa` para `org.springframework.boot.hibernate.autoconfigure`, e `MongoAutoConfiguration`/`JpaRepositoriesAutoConfiguration` também mudaram de pacote e (no caso do Mongo) de artefato. Vale conferir o pacote real (`unzip -l` no jar em `~/.m2`) antes de usar `spring.autoconfigure.exclude` com versões novas do Boot.

## Emissão de token do LiveKit (`GET /room/{roomId}/token`)

`RoomTokenController` recebe `identity` (`<userId>.<tabNonce>`, montado no cliente - ver [`frontend.md`](frontend.md)) e `name` via query string, valida que a sala existe no `RoomCatalog` e devolve `{token, url}`. `token` é um JWT HS256 montado por `LiveKitTokenService` com um "video grant" (`room`, `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData`, `canUpdateOwnMetadata`) - o backend nunca vê SDP/ICE/mídia, isso é tudo negociado depois, direto entre o navegador e o LiveKit.

Sala desconhecida devolve **404** (`ResponseStatusException`), e não 500: com roteamento no cliente esse caminho ficou alcançável de verdade (bookmark antigo, id removido do catálogo), e um 500 do Spring viria como página HTML que o `res.json()` do cliente não consegue parsear.

`canUpdateOwnMetadata` existe pra que trocar o nome de exibição propague via `localParticipant.setName()` sem reconectar. Sem ele o LiveKit rejeita com "does not have permission to update own metadata" e só a própria tela atualiza. Não amplia risco: a pessoa já escolhe o nome que quiser ao entrar.

## Presença: `GET /api/presence`

Devolve `{roomId: [{identity, name}]}` com **uma chave por canal do catálogo, sempre** (lista vazia quando ninguém está lá) - estabilidade de contrato vale mais que alguns bytes, porque a sidebar renderiza as linhas de forma incondicional.

`LiveKitRoomService` fala a API Twirp da RoomService do LiveKit com `java.net.http.HttpClient` (JDK puro, sem dependência nova - mesma decisão do JWT à mão). Detalhes conferidos contra o servidor real, não supostos:

- Os endpoints ficam na **mesma porta 7880** da sinalização: `POST /twirp/livekit.RoomService/{ListRooms,ListParticipants}`.
- O JSON de resposta é **snake_case** com todos os campos emitidos (`num_participants`), e int64 vem como **string** (`"creation_time":"1787325813"`).
- **`roomAdmin` exige que o `room` do grant seja igual à sala pedida.** Não existe wildcard: `roomAdmin` sem `room`, ou com `room:"*"`, é rejeitado com **401**. Ou seja, é um token admin **por canal** - `LiveKitTokenService.createRoomAdminToken(roomId)`. `ListRooms` precisa só de `roomList` e um token serve pra todos.
- Falha de autenticação volta **401 antes do Twirp**, então pode não ter o formato `{code,msg,meta}` - o status é conferido antes de tentar parsear o corpo.
- `ListRooms` **não** filtra por contagem: uma sala que ninguém nunca entrou está ausente, e uma que acabou de esvaziar aparece com `num_participants: 0` por até ~5min (`empty_timeout`). Por isso o filtro é pela **contagem**, não pela presença da chave.

`PresenceService` faz `ListRooms` primeiro (1 requisição, já diz quais canais têm gente) e só chama `ListParticipants` nos não vazios - em repouso isso é 1 requisição por janela em vez de uma por canal. O cache usa `tryLock`, e **não `synchronized`**: com `synchronized`, um LiveKit travado faria toda requisição concorrente enfileirar atrás de um timeout de 3s e as threads do Tomcat empilhariam, transformando uma dependência lenta em indisponibilidade do app. Com `tryLock` só uma thread paga a latência; as outras devolvem o snapshot anterior na hora.

O endpoint responde **sempre 200**, mesmo com o LiveKit fora do ar - a degradação vai no header `X-Presence-Stale` e o corpo carrega o último mapa conhecido. Um 500 aqui seria o pior modo de falha possível (página HTML que o poller não parseia); um 503 exigiria um segundo caminho de parse pra uma informação que o header já dá. E servir o último dado conhecido é melhor que um mapa vazio: "todo mundo saiu" é mentira ativa, dado de 5s atrás é quase sempre verdade.

O endpoint **não é autenticado**, e isso é decisão consciente: expõe os nomes de exibição de quem está online a qualquer um que alcance o app. Combina com o resto do projeto (que não tem login nenhum) e com o comportamento do Discord dentro de um servidor; não vaza token e não permite entrar em sala nenhuma.

Ver [`docs/projeto/arquitetura.md`](arquitetura.md) e [`docs/conceito/webrtc.md`](../conceito/webrtc.md) (que ainda documenta o design mesh P2P anterior, como material de estudo).

## Próxima fase (não implementada ainda)

- **`chat/`** — `ChatController` (`@MessageMapping`/`@SendTo`), `ChatMessage` (documento MongoDB), `ChatMessageRepository`. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).
- Persistência de `Room`/`Participant` no Postgres, se fizer sentido nesse ponto. Ver [`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md).
- Reverter o `spring.autoconfigure.exclude` acima quando isso entrar.

## Dependências principais

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-webmvc` | Controllers que renderizam o shell e servem o JSON (`AppShellController`, `RoomTokenController`, `PresenceController`) |
| `spring-boot-starter-thymeleaf` | Motor de template server-side (`shell.html`) |
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
