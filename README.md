# NullPointerTalk

Laboratório de estudos (**não produtivo**) para aprofundar em comunicação em tempo real na web: chat de voz/vídeo com webcam, compartilhamento de tela e mensagens de texto, usando Java/Spring — um projeto único, sem frontend separado: Thymeleaf + JavaScript puro.

## Arquitetura

```
NullPointerTalk/
  src/         Spring Boot (Maven, Java 21) — serve páginas (Thymeleaf), estáticos (JS puro) e WebSocket
  pom.xml
  docker-compose.yml   Postgres + MongoDB (infra local, usada a partir da fase do chat)
  docs/
    conceito/  explicações dos conceitos usados, com referências
    projeto/   docs sobre o código/estrutura do projeto
```

Repositório único — sem subpasta `backend/`, o Maven roda direto na raiz.

Ver [`docs/projeto/arquitetura.md`](docs/projeto/arquitetura.md) para o diagrama completo de como as peças se conectam.

### Decisões de estudo

- **Sem login/senha**: nome do usuário fica em `localStorage` do navegador, pedido uma vez num overlay na home.
- **Salas fixas** (fase 1): definidas no código (`RoomCatalog`), sem CRUD, sem persistência ainda — estilo lista de canais de um servidor Discord.
- **Thymeleaf + JS puro** em vez de um SPA: um módulo Maven só, sem build de frontend, sem CORS a configurar (mesma origem). Ver [`docs/projeto/frontend.md`](docs/projeto/frontend.md).
- **Mídia (áudio/vídeo/tela)**: WebRTC em **mesh P2P** — cada participante conecta diretamente com os demais via `RTCPeerConnection`. Escolhido para expor os fundamentos do protocolo (SDP, ICE) sem depender de um SFU externo (mediasoup/LiveKit), que tiraria o foco do ecossistema Java/Spring. Não escala bem além de poucos participantes, mas não é o objetivo aqui.
- **Sinalização WebRTC** (troca de offer/answer/ICE candidates): **WebSocket puro** (`TextWebSocketHandler`), sem abstração, para entender o protocolo na unha.
- **STUN/TURN**: por enquanto só **STUN público** (Google), suficiente para testes na mesma rede/localhost. `webrtc.ice-servers` no `application.properties` do backend é o ponto de extensão para plugar um TURN (coturn) mais tarde.

### Próxima fase (não implementada ainda)

- **Chat de texto**: **STOMP sobre WebSocket** (com SockJS), para estudar a camada de pub/sub idiomática do Spring (tópicos por sala) e comparar com a sinalização em WebSocket puro.
- **Persistência poliglota**: **Postgres** para dados relacionais (Room, Participant, se fizer sentido) e **MongoDB** para o histórico de mensagens de chat.

### Fase 3 (não implementada ainda)

Quando este laboratório for hospedado numa VPS para testar com amigos (rede real, NAT restritivo entre as pontas):
- Subir um `coturn` (TURN/STUN próprio) e apontar `webrtc.ice-servers` para ele.
- Dockerfile do backend para deploy.

## Como rodar

```bash
./mvnw spring-boot:run   # sobe em :8080, sem precisar do docker compose nesta fase
```

Abra `http://localhost:8080` em duas abas/navegadores diferentes (uma normal + uma anônima, pra ter `localStorage` separado), defina nomes diferentes, entre na mesma sala e teste vídeo (mesh) e compartilhamento de tela.

## Conteúdos de referência

- *WebRTC for the Curious* — livro/site gratuito, referência mais completa sobre ICE/STUN/TURN/SDP.
- Guias oficiais do Spring: WebSocket e STOMP messaging.
- Artigos da Baeldung sobre Spring WebSocket e STOMP.
- `webrtc.github.io/samples` — demos oficiais do Google com cada API do WebRTC isolada.
- `chrome://webrtc-internals` — para inspecionar os ICE candidates trocados durante os testes.
