# Frontend: Thymeleaf + JavaScript puro

Sem projeto separado, sem build, sem npm — o próprio Spring Boot serve as páginas (Thymeleaf), o CSS e o JS (`src/main/resources/`), no mesmo repositório/módulo Maven do backend. WebRTC (`getUserMedia`, `getDisplayMedia`, `RTCPeerConnection`, `WebSocket`) é API nativa do navegador, então não depende de framework nenhum; a decisão aqui foi só sobre quem renderiza o HTML.

## Por que Thymeleaf + JS puro (e não React/Vite)

Projeto de laboratório para estudar tempo real na web — não precisa da complexidade de um SPA com build próprio, roteamento client-side ou gerenciamento de estado tipo Redux para uma tela de vídeo com salas fixas. Um único módulo Maven simplifica: sem CORS (mesma origem), sem processo `npm run dev` paralelo, sem passo de bundling. Os scripts usam ES modules nativos do browser (`<script type="module">`).

## Estrutura atual

```
src/main/resources/
  templates/
    home.html    # sidebar de salas (th:each, vem de RoomCatalog) + overlay de "defina seu nome"
    room.html    # grid de vídeo (montado via JS) + barra de controles
  static/
    css/
      app.css        # visual dark, estilo Discord
    js/
      home.js        # name-gate: lê/grava localStorage, mostra overlay se não tem nome
      signaling.js   # wrapper fino sobre WebSocket nativo (connect, send, on)
      media.js       # getUserMedia + toggles de mic/câmera
      screenshare.js # getDisplayMedia (troca de track fica em peers.js)
      peers.js       # mesh: Map<peerId, RTCPeerConnection>, trata offer/answer/ICE, expõe remote streams
      room.js        # controller da página: junta name+peerId+signaling+media+peers, renderiza os tiles
```

## Como as peças se conectam

- **Nome do usuário**: sem login — `localStorage` (`npt.username`). `home.js` mostra um overlay pedindo o nome se ainda não existe; `room.js` lê o mesmo valor (redireciona pra `/` se ausente).
- **Salas**: fixas, vêm do `RoomCatalog` do backend, renderizadas server-side em `home.html`. Clicar em uma navega via link normal (`<a href="/room/{id}">`), sem JS de roteamento.
- **Sinalização**: `signaling.js` abre um `WebSocket` em `/ws/signaling?roomId=...&peerId=...&name=...`; `peers.js` reage às mensagens (`peers`, `offer`, `answer`, `ice-candidate`, `peer-left`) montando o mesh P2P. Ver [`docs/conceito/sinalizacao-websocket.md`](../conceito/sinalizacao-websocket.md).
- **Mídia**: `media.js` (câmera/mic) e `screenshare.js` (`getDisplayMedia`); troca de track pra tela via `RTCPeerConnection.getSenders()[...].replaceTrack()` dentro de `peers.js`. Ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md).
- **ICE servers**: o STUN configurado em `application.properties` (`webrtc.ice-servers[0].urls`) é injetado no `room.html` via `th:attr` (atributo `data-ice-server-url` no `<body>`) — fonte única de configuração, sem round-trip de API extra.

## Próxima fase (não implementada ainda)

Chat de texto via STOMP: o cliente `@stomp/stompjs` pode ser incluído via `<script>` de CDN (sem precisar de npm/build) quando essa fase entrar. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).

## Rodar localmente

Não há passo separado — sobe junto com o backend:

```bash
./mvnw spring-boot:run   # http://localhost:8080
```
