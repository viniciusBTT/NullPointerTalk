# Arquitetura do projeto

## Visão geral

```
NullPointerTalk/
  pom.xml
  src/main/java/com/nullpointertalk/     código Java
  src/main/resources/
    templates/   Thymeleaf (home.html, room.html)
    static/      CSS + JS puro (sem build, sem npm)
  docker-compose.yml   Postgres + MongoDB (infra local, usada a partir da fase do chat)
  docs/
    conceito/   explicações dos conceitos usados, com referências
    projeto/    este conjunto de docs, sobre o código em si
```

Repositório único (sem subpasta `backend/`, sem frontend separado): o Spring Boot roda direto na raiz, renderiza as páginas com Thymeleaf e serve o JS puro que roda no navegador. Ver [`docs/projeto/backend.md`](backend.md) e [`docs/projeto/frontend.md`](frontend.md).

## Como as peças se conectam

```
┌───────────────────────────────────────────┐         WebSocket puro          ┌──────────────────────────┐
│  Navegador A                               │ ───── sinalização WebRTC ─────► │  Backend (Spring Boot)   │
│  (home.html/room.html + JS puro)           │ ◄──── offer/answer/ICE ──────── │                          │
│                                             │                                 │  SignalingWebSocketHandler│
│  ┌────────────────────┐                    │                                 │  HomeController           │
│  │ RTCPeerConnection   │                    │                                 │  RoomController           │
│  │ (mesh P2P)          │                    │                                 │  RoomCatalog (salas fixas)│
│  └────────────────────┘                    │                                 │                          │
│           │ mídia direta (áudio/vídeo/tela) │                                 │                          │
│           ▼                                │                                 │                          │
│  ┌────────────────────┐                    │                                 │                          │
│  │ Navegador B         │                    │                                 │                          │
│  │ (peer remoto)       │                    │                                 │                          │
│  └────────────────────┘                    │                                 │                          │
└───────────────────────────────────────────┘                                 └──────────────────────────┘
```

**Sinalização WebRTC** — WebSocket puro (`/ws/signaling`). Só transporta offer/answer/ICE candidates entre os navegadores da mesma sala, direcionado por `peerId` (campo `to`). Ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md).

A mídia (áudio/vídeo/tela) trafega **direto entre os navegadores** depois que a sinalização termina — o backend nunca vê esses bytes. Ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md).

## Por que essas escolhas

Decisões tomadas para maximizar aprendizado, documentadas em detalhe em `docs/conceito/`:

- **Mesh P2P** em vez de SFU — expõe os fundamentos do WebRTC sem infraestrutura de mídia externa ao Java/Spring.
- **WebSocket puro** para sinalização, sem abstração — mostra o ciclo de vida completo de uma sessão WebSocket (conectar, registrar, rotear, desconectar).
- **Thymeleaf + JS puro** em vez de um SPA (React/Vite) — projeto de laboratório, sem necessidade de build/roteamento client-side/estado global para uma tela de vídeo com salas fixas. Um módulo Maven só, sem CORS a configurar.
- **Salas fixas no código** (fase 1) — sem CRUD, sem persistência ainda; simplifica o primeiro corte funcional.
- **STUN público** por enquanto — suficiente para testes em localhost/mesma rede.

## Próxima fase (não implementada ainda)

- **Chat de texto** — STOMP sobre WebSocket (`/ws/chat`, com broadcast por sala via tópicos), comparando com a sinalização em WebSocket puro. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).
- **Persistência poliglota** — Postgres para dados relacionais (Room/Participant, se fizer sentido) e MongoDB para o histórico de chat. Ver [`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md). A autoconfiguração de JPA/Mongo está desligada em `application.properties` até essa fase entrar (ver [`docs/projeto/backend.md`](backend.md)).

## Fase 3 (não implementada ainda)

Quando o projeto for hospedado numa VPS para testar com pessoas em redes diferentes (NAT real entre as pontas):

- Subir um `coturn` (servidor TURN próprio) e apontar `webrtc.ice-servers` (em `application.properties`) para ele.
- Criar Dockerfile do backend para deploy.

## Ver também

- [`docs/projeto/backend.md`](backend.md) — estrutura de pacotes do backend
- [`docs/projeto/frontend.md`](frontend.md) — estrutura de pastas do frontend
- `README.md` na raiz — instruções de como rodar
