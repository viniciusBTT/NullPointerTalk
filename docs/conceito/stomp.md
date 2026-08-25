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
  endpoint /ws/chat
  broker simples em memória habilitado para /topic

ChatController:
  @MessageMapping("/chat/{roomId}")
  recebe a mensagem, valida que a sala existe, salva no MongoDB
  (via ChatService) e distribui manualmente com
  SimpMessagingTemplate.convertAndSend("/topic/room/{roomId}", ...)
```

**Desvio de propósito em relação ao `@SendTo`**: a implementação real usa
`SimpMessagingTemplate.convertAndSend` manual em vez de `@SendTo("/topic/room/{roomId}")` no
método do controller. A diferença importa num caso: com `@SendTo`, QUALQUER retorno do método
vira broadcast automaticamente - não dá pra "descartar em silêncio" uma mensagem para uma sala
desconhecida ou que falhou validação sem ainda assim distribuir alguma coisa. Com
`convertAndSend` manual, o método pode simplesmente `return` cedo (sem chamar `convertAndSend`)
nesses casos, e nada é distribuído.

**Sem fallback SockJS**: o projeto não tem nenhuma concessão a navegador antigo em lugar
nenhum (o próprio LiveKit já exige WebSocket nativo pra sinalização), então vendorizar uma
segunda lib (`sockjs-client`) só pra um fallback que nada mais no app precisa não compensou.

No frontend, o cliente STOMP (`@stomp/stompjs`, vendorizado como UMD em `js/vendor/stomp.umd.min.js`
- ver `js/vendor/README.md`) se conecta em `/ws/chat`, assina o tópico de **todas** as salas do
catálogo já ao conectar (não só a atualmente aberta - é o que permite badge de não-lida em
salas onde a pessoa não está) e publica mensagens digitadas pelo usuário.

## SockJS: por que NÃO tem fallback aqui

Nem todo ambiente de rede permite WebSocket puro (proxies antigos, alguns firewalls corporativos) - é pra isso que SockJS existiria: tentar WebSocket primeiro e cair para polling HTTP se não conseguir. Mas este projeto especificamente decidiu não vendorizar essa segunda lib: o próprio LiveKit já exige WebSocket nativo pra sinalização de voz/vídeo em todo lugar, então o app já não tem nenhuma concessão a navegador/rede antiga - adicionar SockJS só pro chat compraria compatibilidade que nada mais na aplicação garante.

## Referências

- Documentação do Spring Framework, seção *WebSocket → STOMP* — cobre `@EnableWebSocketMessageBroker`, `@MessageMapping`, `@SendTo`.
- Guia oficial: *"Using WebSocket to Build an Interactive Web Application"* em [spring.io/guides](https://spring.io/guides).
- [Especificação STOMP](https://stomp.github.io/stomp-specification-1.2.html) — protocolo em si, frames (`CONNECT`, `SEND`, `SUBSCRIBE`, `MESSAGE`).
- [Documentação do @stomp/stompjs](https://stomp-js.github.io/) — cliente usado no frontend.
