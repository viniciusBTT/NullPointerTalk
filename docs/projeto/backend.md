# Backend

Spring Boot 4.1.0, Java 21, Maven. Ver dependências completas em [`pom.xml`](../../pom.xml).

Repositório único, sem subpasta `backend/`: o Maven roda direto na raiz, e esse mesmo projeto serve as páginas (Thymeleaf), os estáticos (CSS/JS puro) e o WebSocket de sinalização — não há um processo de frontend separado. Ver [`docs/projeto/frontend.md`](frontend.md) para a parte de templates/JS.

## Estado atual (WebRTC áudio/vídeo/tela via LiveKit + chat persistido via STOMP/MongoDB + CRUD de salas)

```
src/main/java/com/nullpointertalk/
  BackendApplication.java
  livekit/
    LiveKitTokenService.java      # monta o JWT de acesso do LiveKit (HMAC-SHA256, à mão)
    LiveKitRoomService.java       # Twirp da RoomService (ListRooms/ListParticipants/DeleteRoom)
    LiveKitRooms.java             # interface (fake em teste, sem Mockito)
  room/
    RoomInfo.java                 # record de leitura: id, name, icon
    Room.java                     # @Entity JPA (Postgres) - id é o slug, PK direta
    RoomRepository.java           # JpaRepository<Room, String>
    RoomDirectory.java            # interface (RoomCatalog é o único @Component; fake em teste)
    RoomCatalog.java              # implementa RoomDirectory, hoje persistido via RoomRepository
    RoomSeeder.java                # CommandLineRunner: garante "estudos"/"jogos" no boot
    RoomController.java           # POST/PUT/DELETE /api/rooms - CRUD aberto, sem login
    RoomCreateRequest.java / RoomUpdateRequest.java / RoomCatalogEvent.java
    AppShellController.java       # GET /  e  GET /room/{roomId} -> shell.html (o MESMO template)
    RoomTokenController.java      # GET /room/{roomId}/token -> {token, url}
    PresenceController.java       # GET /api/presence -> {roomId: [{identity, name}]}
    PresenceService.java          # agrega a presenca e faz cache (single-flight)
  chat/
    ChatMessage.java              # @Document MongoDB (roomId, stableId, name, text, timestamp)
    ChatMessageRepository.java    # MongoRepository - historico, cap de 250, trim
    ChatService.java              # salva e mantem o cap de 250 mensagens por sala
    StompConfig.java              # @EnableWebSocketMessageBroker, endpoint /ws/chat
    ChatController.java           # @MessageMapping("/chat/{roomId}") -> distribui em /topic/room/{roomId}
    ChatHistoryController.java    # GET /api/rooms/{roomId}/messages - historico e contagem de nao-lidas
    ChatMessageRequest.java / ChatMessageView.java
src/main/resources/
  application.properties
  application-vps.properties      # perfil vps: livekit.url/api-key/api-secret apontando pra VPS
  templates/  (ver docs/projeto/frontend.md)
  static/     (ver docs/projeto/frontend.md)
```

`application.properties` tem as conexões com Postgres e MongoDB (`Room` via JPA, `ChatMessage` via
Mongo) - a autoconfiguração de ambos já está ligada (o antigo `spring.autoconfigure.exclude` que
desligava JPA/Mongo foi removido quando essas entidades entraram). `spring.data.mongodb.auto-index-creation=true`
é necessário pro índice composto de `ChatMessage` (`roomId` + `timestamp`) ser criado de verdade -
sem essa propriedade o Spring Data Mongo só valida contra índices já existentes, nunca cria um novo.

**Nota Spring Boot 4.1**: os pacotes de autoconfiguração foram reorganizados por módulo nessa versão — por exemplo `HibernateJpaAutoConfiguration` mudou de `org.springframework.boot.autoconfigure.orm.jpa` para `org.springframework.boot.hibernate.autoconfigure`, e `MongoAutoConfiguration`/`JpaRepositoriesAutoConfiguration` também mudaram de pacote e (no caso do Mongo) de artefato. Vale conferir o pacote real (`unzip -l` no jar em `~/.m2`) antes de usar `spring.autoconfigure.exclude` com versões novas do Boot.

## Chat: STOMP + MongoDB

O chat de texto não usa mais o canal de dados do LiveKit (isso era efêmero: só quem estava
conectado naquele momento recebia, e nada sobrevivia a um reload). Hoje o backend é a única
fonte de verdade:

- Cliente conecta em `/ws/chat` (STOMP puro, sem fallback SockJS - o app já não tem nenhuma
  concessão a navegador antigo em lugar nenhum, ver `js/vendor/README.md`).
- `SEND /app/chat/{roomId}` -> `ChatController` valida a sala (descarta em silêncio se
  desconhecida - não usa `@SendTo` de propósito, pra não forçar broadcast num caso invalido),
  salva via `ChatService` e distribui manualmente com `SimpMessagingTemplate.convertAndSend`
  em `/topic/room/{roomId}`.
- `ChatService.save` mantém um cap de 250 mensagens por sala: insere e, se a contagem passar de
  250, apaga o excedente mais antigo. É um cap suave (soft), não uma garantia atômica sob
  concorrência pesada - aceitável pro volume de um chat de laboratório.
- `GET /api/rooms/{roomId}/messages` (com `after` opcional, epoch ms) serve tanto o histórico
  completo (sem `after`) quanto a contagem de não-lidas de uma sala ainda não aberta nesta sessão
  (`after=<último lido>`) - um único endpoint pras duas perguntas.
- O cliente (`core/chat-session.js`) assina o tópico de **todas** as salas do catálogo já ao
  conectar, independente de qual sala está com a voz ligada - é isso que permite badge de
  não-lida numa sala que a pessoa não está ouvindo.

## CRUD de salas

`RoomCatalog` deixou de ser uma lista fixa: agora é uma view sobre `RoomRepository`
(Postgres/JPA), com `RoomSeeder` garantindo as duas salas padrão (`estudos`, `jogos`) na
primeira subida. `RoomController` expõe `POST/PUT/DELETE /api/rooms` - aberto, sem
autenticação (mesma filosofia do resto do app, que não tem login nenhum). Cada
criação/edição/exclusão publica um evento em `/topic/room-catalog`, que é como toda aba aberta
fica sincronizada sem precisar de reload (um reload derrubaria a própria conexão de voz de quem
só estava editando uma sala diferente).

Apagar uma sala remove do Postgres, apaga o histórico de chat correspondente no Mongo
(`ChatMessageRepository.deleteByRoomId` - obrigatório, senão reusar o slug depois ressuscitaria
histórico velho) e chama `LiveKitRooms.deleteRoom` (Twirp `DeleteRoom`, melhor esforço) - isso
derruba quem estiver conectado com `DisconnectReason.ROOM_DELETED`, que o cliente reconhece
especificamente pra voltar pra home sem oferecer um banner de "Reconectar" (ver `frontend.md`).

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

## Dependências principais

| Dependência | Propósito |
|---|---|
| `spring-boot-starter-webmvc` | Controllers que renderizam o shell e servem o JSON (`AppShellController`, `RoomTokenController`, `PresenceController`, `RoomController`, `ChatHistoryController`) |
| `spring-boot-starter-thymeleaf` | Motor de template server-side (`shell.html`) |
| `spring-boot-starter-websocket` | Chat via STOMP (`StompConfig`/`ChatController`) - a sinalização WebRTC continua toda no LiveKit, isso aqui é só o chat |
| `spring-boot-starter-data-jpa` + `postgresql` | ORM/driver para Postgres (`Room`) |
| `spring-boot-starter-data-mongodb` | Persistência de `ChatMessage` |
| `spring-boot-starter-validation` | Validação de DTOs (`RoomTokenController`, `RoomCreateRequest`/`RoomUpdateRequest`, `ChatMessageRequest`) |
| `lombok` | Reduz boilerplate |
| `devtools` | Live reload em dev |

## Rodar localmente

```bash
docker compose up -d postgres mongo livekit   # Postgres, MongoDB e o servidor de mídia
./mvnw spring-boot:run                        # sobe em :8080
```

## Testando via túnel (ngrok e afins)

`server.forward-headers-strategy=native` em `application.properties` é necessário pra isso funcionar - sem ele o Spring vê o request como `http` mesmo quando o navegador fala `https` com o túnel/proxy, gerando URLs/paginas erradas atrás de TLS terminado na frente.

Isso resolve a parte de servir a página e emitir o token. A conexão de mídia (`livekit-client` -> LiveKit) é **separada** e não passa pelo backend Java - o cliente conecta direto na `livekit.url`. Ngrok tuneliza bem WebSocket/HTTPS (a sinalização do LiveKit), mas a mídia em si é UDP puro, que ngrok não encaminha - então uma chamada de verdade entre duas pessoas só funciona apontando `livekit.url` pra um LiveKit acessível publicamente (VPS com porta UDP aberta), não por trás de um túnel ngrok. Ver [`docs/projeto/arquitetura.md`](arquitetura.md#deploy-na-vps-livekit--nginx--tls).
