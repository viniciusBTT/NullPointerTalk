# NullPointerTalk

Laboratório de estudos (**não produtivo**) para aprofundar em comunicação em tempo real na web: chat de voz/vídeo com webcam, compartilhamento de tela e mensagens de texto, usando Java/Spring no backend e Vue.js no frontend — mono repo, backend como origem única em produção.

## Arquitetura

```
NullPointerTalk/
  src/         Spring Boot (Maven, Java 21) — API REST, WebSocket (STOMP) e o shell estático em produção
  frontend/    Vue 3 + TypeScript + Pinia + Vite + Tailwind CSS (projeto Vite independente)
  pom.xml
  docker-compose.yml   LiveKit (servidor de mídia SFU)
  docs/
    conceito/  explicações dos conceitos usados, com referências
    projeto/   docs sobre o código/estrutura do projeto
```

Mono repo — sem subpasta `backend/`, o Maven roda direto na raiz. Em produção, `./mvnw clean
package` builda o `frontend/` e embute o resultado no jar: só o processo Spring Boot é servido,
numa única origem (sem CORS). Em desenvolvimento, o frontend roda como um segundo processo
(Vite) com hot-reload — ver "Como rodar" abaixo.

Ver [`docs/projeto/arquitetura.md`](docs/projeto/arquitetura.md) para o diagrama completo de como as peças se conectam.

### Decisões de estudo

- **Sem login/senha**: nome do usuário fica em `localStorage` do navegador, pedido uma vez num overlay na home.
- **Salas fixas** (fase 1): definidas no código (`RoomCatalog`), sem CRUD, sem persistência ainda — estilo lista de canais de um servidor Discord.
- **Vue.js 3 + TypeScript + Pinia + Vite + Tailwind CSS** no frontend, buildado à parte e embutido no jar do backend em produção (mesma origem, sem CORS). A interface é um shell persistente de página única — trocar de canal não recarrega nada. Ver [`docs/projeto/frontend.md`](docs/projeto/frontend.md).
- **Mídia (áudio/vídeo/tela)**: WebRTC via **SFU self-hosted (LiveKit)** — cada participante mantém uma única conexão com o servidor de mídia, que reencaminha os streams pros demais (em vez de mesh P2P, uma `RTCPeerConnection` por participante remoto). Ver [`docs/projeto/arquitetura.md`](docs/projeto/arquitetura.md).
- **Autenticação da chamada**: o backend emite um token de acesso (JWT HS256, `LiveKitTokenService`) por sala/participante — nunca vê SDP/ICE/mídia, isso é tudo negociado direto entre o navegador e o LiveKit.
- **STUN/TURN**: embutidos no próprio LiveKit (sem `coturn` separado).
- **Robustez da chamada**: reconexão automática gerenciada pelo `livekit-client` (retry de ICE/DTLS internamente), sem lógica manual de reconexão no app.
- **Indicadores em chamada**: badge de mic/câmera desligados nos tiles (local e remoto), indicador de "falando agora" (via `RoomEvent.ActiveSpeakersChanged` do LiveKit), toasts de entrada/saída e um indicador de qualidade de conexão por participante.

### Próxima fase (não implementada ainda)

- **Histórico de chat**: o chat já funciona pelo canal de dados do LiveKit, mas sem persistência. **STOMP sobre WebSocket** (com SockJS) + MongoDB entram para isso, e para estudar a camada de pub/sub idiomática do Spring (tópicos por sala).
- **Persistência poliglota**: **Postgres** para dados relacionais (Room, Participant, se fizer sentido) e **MongoDB** para o histórico de mensagens de chat.

### Deploy numa VPS para chamadas reais

Para hospedar numa VPS e usar com amigos em redes diferentes (NAT real entre as pontas):
- `livekit` sobe via `docker-compose.yml` (config em `livekit/livekit.yaml`, TURN já embutido).
- Ativar o perfil `vps` (`SPRING_PROFILES_ACTIVE=vps`, config em `application-vps.properties`) aponta `livekit.url` pro subdomínio público do LiveKit.
- Antes de subir: trocar o par `keys:` em `livekit/livekit.yaml` por um segredo próprio (>= 32 caracteres), e replicar em `livekit.api-key`/`livekit.api-secret` no `application-vps.properties` — os dois precisam bater.
- Precisa de um subdomínio próprio com TLS (ex: `livekit.SEUDOMINIO` via nginx + Let's Encrypt) proxiando pra porta 7880, e do range de portas UDP de mídia aberto no firewall — ver [`docs/projeto/arquitetura.md`](docs/projeto/arquitetura.md#deploy-na-vps-livekit--nginx--tls).
- **ngrok não serve pra chamadas de verdade**: só a sinalização tunela por ele, a mídia é UDP puro. Útil só pra teste solo local.

## Como rodar

### Produção (um processo só)

```bash
docker compose up -d postgres mongo livekit   # Postgres, MongoDB e o servidor de mídia
./mvnw clean package                          # builda o frontend/ e embute no jar
java -jar target/backend-0.0.1-SNAPSHOT.jar   # sobe em :8080
```

### Desenvolvimento (hot-reload no frontend)

```bash
docker compose up -d postgres mongo livekit
./mvnw spring-boot:run                        # backend em :8080

# num segundo terminal:
cd frontend
npm install
npm run dev                                   # Vite em :5173, com proxy pro backend
```

Durante o desenvolvimento, abra `http://localhost:5173` (não `:8080`) — é o Vite quem serve a UI
com hot-reload. Em produção, abra `http://localhost:8080`. Em ambos os casos: em duas
abas/navegadores diferentes (uma normal + uma anônima, pra ter `localStorage` separado), defina
nomes diferentes, entre na mesma sala e teste vídeo e compartilhamento de tela.

## Conteúdos de referência

- *WebRTC for the Curious* — livro/site gratuito, referência mais completa sobre ICE/STUN/TURN/SDP.
- Guias oficiais do Spring: WebSocket e STOMP messaging.
- Artigos da Baeldung sobre Spring WebSocket e STOMP.
- `webrtc.github.io/samples` — demos oficiais do Google com cada API do WebRTC isolada.
- `chrome://webrtc-internals` — para inspecionar os ICE candidates trocados durante os testes.
