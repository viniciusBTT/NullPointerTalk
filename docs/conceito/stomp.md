# STOMP: pub/sub para o chat de texto

## O que é STOMP

STOMP (Simple Text Oriented Messaging Protocol) é um protocolo de mensageria simples, baseado em texto, que roda **sobre** WebSocket. Ele adiciona uma camada de conceitos (tópicos, filas, subscribe/publish) que o WebSocket puro não tem — o WebSocket, sozinho, só sabe mandar/receber frames de texto/binário, sem noção de "canal" ou "assinatura".

## Por que STOMP para o chat (e WebSocket puro para a sinalização)

O chat é um caso clássico de **broadcast em sala**: uma mensagem enviada por um participante precisa chegar em todos os outros da mesma sala, e novos participantes que entram depois só precisam receber mensagens dali pra frente. Isso é exatamente o modelo pub/sub:

- Cliente **assina** (`SUBSCRIBE`) o tópico `/topic/room/{roomId}`
- Cliente **publica** (`SEND`) em `/app/chat/{roomId}`
- O broker (embutido no Spring, em memória) distribui a mensagem para todos os assinantes daquele tópico

Com WebSocket puro, você teria que reimplementar esse roteamento manualmente (o que fizemos de propósito na sinalização, para aprender — ver `docs/conceito/sinalizacao-websocket.md`). Aqui, a ideia é comparar: o mesmo problema (repassar mensagens entre clientes conectados) resolvido de duas formas diferentes no mesmo projeto.

## Como funciona no projeto

```
StompConfig:
  @EnableWebSocketMessageBroker
  endpoint /ws/chat (com fallback SockJS para navegadores sem WebSocket)
  broker simples em memória habilitado para /topic e /queue

ChatController:
  @MessageMapping("/chat/{roomId}")
  @SendTo("/topic/room/{roomId}")
  recebe a mensagem, salva no MongoDB (ChatMessage), retorna pra ser
  distribuída a todos os assinantes da sala
```

No frontend, o cliente STOMP (`@stomp/stompjs`, com fallback `sockjs-client`) se conecta em `/ws/chat`, assina o tópico da sala atual e publica mensagens digitadas pelo usuário.

## SockJS: por que o fallback

Nem todo ambiente de rede permite WebSocket puro (proxies antigos, alguns firewalls corporativos). SockJS tenta WebSocket primeiro e cai para polling HTTP se não conseguir — o cliente e o servidor concordam em usar essa camada de compatibilidade sem você precisar tratar isso manualmente.

## Referências

- Documentação do Spring Framework, seção *WebSocket → STOMP* — cobre `@EnableWebSocketMessageBroker`, `@MessageMapping`, `@SendTo`.
- Guia oficial: *"Using WebSocket to Build an Interactive Web Application"* em [spring.io/guides](https://spring.io/guides).
- [Especificação STOMP](https://stomp.github.io/stomp-specification-1.2.html) — protocolo em si, frames (`CONNECT`, `SEND`, `SUBSCRIBE`, `MESSAGE`).
- [Documentação do @stomp/stompjs](https://stomp-js.github.io/) — cliente usado no frontend.
