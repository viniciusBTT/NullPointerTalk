# NullPointerTalk

Laboratório de estudos (**não produtivo**) para aprofundar em comunicação em tempo real na web: chat de voz/vídeo com webcam, compartilhamento de tela e mensagens de texto, usando Java/Spring no backend e React no frontend.

## Arquitetura

```
NullPointerTalk/
  backend/     Spring Boot (Maven, Java 21)
  frontend/    React + Vite + TypeScript
  docker-compose.yml   Postgres + MongoDB (infra local)
  docs/
    conceito/  explicações dos conceitos usados, com referências
    projeto/   docs sobre o código/estrutura do backend e frontend
```

Ver [`docs/projeto/arquitetura.md`](docs/projeto/arquitetura.md) para o diagrama completo de como as peças se conectam.

### Decisões de estudo

- **Mídia (áudio/vídeo/tela)**: WebRTC em **mesh P2P** — cada participante conecta diretamente com os demais via `RTCPeerConnection`. Escolhido para expor os fundamentos do protocolo (SDP, ICE) sem depender de um SFU externo (mediasoup/LiveKit), que tiraria o foco do ecossistema Java/Spring. Não escala bem além de poucos participantes, mas não é o objetivo aqui.
- **Sinalização WebRTC** (troca de offer/answer/ICE candidates): **WebSocket puro** (`TextWebSocketHandler`), sem abstração, para entender o protocolo na unha.
- **Chat de texto**: **STOMP sobre WebSocket** (com SockJS), para estudar a camada de pub/sub idiomática do Spring (tópicos por sala).
- **STUN/TURN**: por enquanto só **STUN público** (Google), suficiente para testes na mesma rede/localhost. `webrtc.ice-servers` no `application.properties` do backend é o ponto de extensão para plugar um TURN (coturn) mais tarde.
- **Persistência poliglota**: **Postgres** para dados relacionais (Room, Participant) e **MongoDB** para o histórico de mensagens de chat (natureza de documento).
- **Estado no frontend**: Redux Toolkit (sala, participantes, chat, estado de mídia).

### Fase 2 (não implementada ainda)

Quando este laboratório for hospedado numa VPS para testar com amigos (rede real, NAT restritivo entre as pontas):
- Subir um `coturn` (TURN/STUN próprio) e apontar `webrtc.ice-servers` para ele.
- Dockerfiles do backend e do frontend para deploy.

## Como rodar

```bash
docker compose up -d              # sobe Postgres e Mongo

cd backend && ./mvnw spring-boot:run   # backend em :8080

cd frontend && npm install && npm run dev   # frontend em :5173
```

Abra a mesma sala em duas abas/navegadores para testar vídeo (mesh), compartilhamento de tela e chat.

## Conteúdos de referência

- *WebRTC for the Curious* — livro/site gratuito, referência mais completa sobre ICE/STUN/TURN/SDP.
- Guias oficiais do Spring: WebSocket e STOMP messaging.
- Artigos da Baeldung sobre Spring WebSocket e STOMP.
- `webrtc.github.io/samples` — demos oficiais do Google com cada API do WebRTC isolada.
- `chrome://webrtc-internals` — para inspecionar os ICE candidates trocados durante os testes.
