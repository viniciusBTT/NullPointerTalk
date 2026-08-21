# Sinalização com WebSocket puro

> **Nota:** este doc descreve o relay de sinalização WebRTC (`/ws/signaling`) que o projeto usava com o mesh P2P. Foi substituído por tokens de acesso do LiveKit (`GET /room/{roomId}/token`) — ver [`docs/projeto/arquitetura.md`](../projeto/arquitetura.md). Fica como material de estudo sobre WebSocket puro no Spring.

## Por que sinalização existe

O WebRTC não define como duas pontas trocam o "convite" (SDP) e os "endereços" (ICE candidates) — isso é responsabilidade da aplicação. É esse papel que o backend cumpre aqui: um "cupido" que apresenta os peers e sai de cena assim que a conexão direta é estabelecida (ver `docs/conceito/webrtc.md`).

## Por que WebSocket puro (e não STOMP) para isso

Existem duas formas de fazer WebSocket no Spring:

- **WebSocket puro** (`TextWebSocketHandler`): você recebe frames de texto crus, define seu próprio formato de mensagem (`{type, roomId, payload}`), guarda sessões manualmente e decide para quem reenviar. Baixo nível, mostra exatamente o que está acontecendo.
- **STOMP sobre WebSocket**: uma camada de pub/sub pronta do Spring (tópicos, `@MessageMapping`), mais adequada para broadcast em sala — é o que usamos para o chat (ver `docs/conceito/stomp.md`).

Para a sinalização, o caso de uso é diferente do chat: são mensagens pontuais, direcionadas a um peer específico (não um broadcast pra sala toda), e o conteúdo (SDP/ICE) é opaco para o servidor — ele só repassa. Fazer isso com WebSocket puro ensina o ciclo de vida completo de uma sessão WebSocket (conectar, registrar, rotear, desconectar) sem a abstração do STOMP escondendo essa parte.

## Como funciona no projeto

O `SignalingWebSocketHandler` (backend) mantém um registro de sessões por sala (`Map<roomId, Set<WebSocketSession>>`) e apenas repassa as mensagens recebidas para os outros participantes da mesma sala:

```
Cliente A                SignalingWebSocketHandler              Cliente B
   │  {type: offer, roomId, sdp}  ────────────────►                │
   │                              (procura sessões da sala,        │
   │                               repassa pra todas exceto o      │
   │                               remetente)                      │
   │                              ────────────────► {type: offer, sdp}
   │                                                                │
   │  ◄──────────────── {type: answer, sdp} ◄──────────────────    │
   │                                                                │
   │  ◄──► {type: ice-candidate, candidate} ◄──►                    │
```

O handler nunca interpreta o conteúdo de `sdp` ou `candidate` — é só transporte.

## Referências

- [MDN — WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) — a API nativa do browser usada no frontend (`features/signaling`).
- Documentação do Spring Framework, seção *WebSocket* (`spring-framework.docs`) — cobre `WebSocketHandler`, `TextWebSocketHandler` e o ciclo de vida de sessões.
- [WebRTC for the Curious — capítulo de sinalização](https://webrtcforthecurious.com/) — explica por que o WebRTC deliberadamente não padroniza esse protocolo.
