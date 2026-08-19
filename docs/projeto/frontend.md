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
      media.js       # getUserMedia (com retry/fallback) + listagem de dispositivos
      screenshare.js # getDisplayMedia
      ui-feedback.js # toasts efêmeros + banner persistente
      room.js        # controller da página: busca token, conecta no LiveKit, renderiza os tiles
      vendor/
        livekit-client.esm.min.js  # SDK do LiveKit, vendorizado (sem npm/build) - ver vendor/README.md
```

## Como as peças se conectam

- **Nome do usuário**: sem login — `localStorage` (`npt.username`). `home.js` mostra um overlay pedindo o nome se ainda não existe; `room.js` lê o mesmo valor (redireciona pra `/` se ausente).
- **Salas**: fixas, vêm do `RoomCatalog` do backend, renderizadas server-side em `home.html`. Clicar em uma navega via link normal (`<a href="/room/{id}">`), sem JS de roteamento.
- **Conexão com o LiveKit**: `room.js` busca um token em `GET /room/{roomId}/token`, cria um `Room` do `livekit-client` e chama `room.connect(url, token)` — uma única conexão WebRTC com o servidor de mídia, em vez de uma por participante remoto. Eventos do `Room` (`RoomEvent.TrackSubscribed`, `ParticipantConnected`, `TrackMuted`, `ActiveSpeakersChanged`, `ConnectionQualityChanged`, `Reconnecting`/`Reconnected`/`Disconnected`, ...) dirigem os tiles/badges/indicadores — ver [`docs/projeto/arquitetura.md`](arquitetura.md).
- **Mídia**: `media.js` (câmera/mic, com fallback pra dispositivo único) e `screenshare.js` (`getDisplayMedia`); publicação/troca de track é feita direto via `room.localParticipant` (`publishTrack`/`unpublishTrack`/`switchActiveDevice`) — sem `RTCPeerConnection` manual. Ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md) (mesh P2P, design anterior deste projeto, mantido como material de estudo).

## Próxima fase (não implementada ainda)

Chat de texto via STOMP: o cliente `@stomp/stompjs` pode ser incluído via `<script>` de CDN (sem precisar de npm/build) quando essa fase entrar. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).

## Rodar localmente

Não há passo separado — sobe junto com o backend:

```bash
./mvnw spring-boot:run   # http://localhost:8080
```
