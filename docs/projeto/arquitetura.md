# Arquitetura do projeto

## Visão geral

```
NullPointerTalk/
  backend/     Spring Boot (Maven, Java 21)
  frontend/    React + Vite + TypeScript
  docker-compose.yml   Postgres + MongoDB (infra local)
  docs/
    conceito/   explicações dos conceitos usados, com referências
    projeto/    este conjunto de docs, sobre o código em si
```

## Como as peças se conectam

```
┌─────────────────────────┐         WebSocket puro          ┌──────────────────────────┐
│  Frontend (React)       │ ───── sinalização WebRTC ─────► │  Backend (Spring Boot)   │
│                          │ ◄──── offer/answer/ICE ──────── │                          │
│  ┌────────────────────┐ │                                 │  SignalingWebSocketHandler│
│  │ RTCPeerConnection   │ │         STOMP + SockJS          │  StompConfig + ChatCtrl   │
│  │ (mesh P2P)          │ │ ───── mensagens de chat ──────► │                          │
│  └────────────────────┘ │ ◄──── broadcast /topic/room ──── │                          │
│           │              │                                 │           │               │
│           │ mídia direta │                                 │      ┌────┴────┐          │
│           ▼              │                                 │      ▼         ▼          │
│  ┌────────────────────┐ │                                 │  Postgres    MongoDB      │
│  │ Outro navegador     │ │                                 │  (Room,      (ChatMessage)│
│  │ (peer remoto)       │ │                                 │   Participant)            │
│  └────────────────────┘ │                                 │                          │
└─────────────────────────┘                                 └──────────────────────────┘
```

Dois canais de comunicação em tempo real, propositalmente com tecnologias diferentes para fins de estudo:

1. **Sinalização WebRTC** — WebSocket puro (`/ws/signaling`). Só transporta offer/answer/ICE candidates entre os navegadores da mesma sala. Ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md).
2. **Chat** — STOMP sobre WebSocket (`/ws/chat`), com broadcast por sala via tópicos. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).

A mídia (áudio/vídeo/tela) trafega **direto entre os navegadores** depois que a sinalização termina — o backend nunca vê esses bytes. Ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md).

## Por que essas escolhas

Decisões tomadas para maximizar aprendizado, documentadas em detalhe em `docs/conceito/`:

- **Mesh P2P** em vez de SFU — expõe os fundamentos do WebRTC sem infraestrutura de mídia externa ao Java/Spring.
- **WebSocket puro** para sinalização e **STOMP** para chat — mesmo problema (rotear mensagens entre clientes conectados), duas soluções diferentes, lado a lado, pra comparar.
- **Postgres + MongoDB** — persistência poliglota: relacional para dados estruturados (Room/Participant), documento para o histórico de chat.
- **STUN público** por enquanto — suficiente para testes em localhost/mesma rede.

## Fase 2 (não implementada ainda)

Quando o projeto for hospedado numa VPS para testar com pessoas em redes diferentes (NAT real entre as pontas):

- Subir um `coturn` (servidor TURN próprio) e apontar `webrtc.ice-servers` (em `application.properties`) para ele.
- Criar Dockerfiles do backend e do frontend para deploy.

## Ver também

- [`docs/projeto/backend.md`](backend.md) — estrutura de pacotes do backend
- [`docs/projeto/frontend.md`](frontend.md) — estrutura de pastas do frontend
- `README.md` na raiz — instruções de como rodar
