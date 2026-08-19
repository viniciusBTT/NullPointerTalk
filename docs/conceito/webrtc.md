# WebRTC: mesh P2P, SDP, ICE, STUN/TURN

> **Nota:** este doc descreve o design original do projeto (mesh P2P), mantido como material de estudo sobre os fundamentos do WebRTC. O projeto migrou pra um SFU self-hosted (LiveKit) — ver [`docs/projeto/arquitetura.md`](../projeto/arquitetura.md) pra arquitetura atual.

## O problema que o WebRTC resolve

Fazer dois navegadores trocarem áudio/vídeo **diretamente**, sem o servidor precisar retransmitir a mídia. O servidor só entra pra "apresentar" as pontas (sinalização) — depois disso, ele sai de cena.

## Mesh P2P vs SFU

Existem duas formas comuns de organizar uma chamada com WebRTC:

- **Mesh P2P** (usado neste projeto): cada participante abre uma `RTCPeerConnection` direta com **cada outro** participante. Com N pessoas, cada uma mantém N-1 conexões — cresce O(n²). O servidor nunca vê a mídia.
- **SFU (Selective Forwarding Unit)**: um servidor de mídia dedicado (mediasoup, LiveKit, Janus) recebe 1 upload de cada participante e reencaminha pros outros, sem decodificar. Escala bem para grupos grandes, mas exige um componente extra (geralmente Node.js/C++) fora do Java/Spring.

**Por que mesh aqui**: expõe 100% dos conceitos fundamentais do protocolo (SDP, ICE, `RTCPeerConnection`) sem precisar de infraestrutura extra. Não escala além de poucos participantes, mas não é o objetivo do laboratório.

## O fluxo de uma conexão

```
A: getUserMedia()  →  captura câmera/mic (sem rede envolvida ainda)
A: cria RTCPeerConnection
A: cria "offer" (SDP)  →  envia via sinalização (WebSocket)  →  B recebe
B: cria RTCPeerConnection, aplica offer, cria "answer" (SDP)  →  volta pra A
A: aplica answer

// em paralelo, os dois lados:
A e B: coletam "ICE candidates" (rotas de rede possíveis) e trocam
       via o mesmo canal de sinalização
A e B: testam os candidates entre si até acharem um caminho que funciona

// se um caminho foi encontrado:
conexão DIRETA (DTLS handshake + SRTP) — mídia flui direto A ↔ B,
o servidor de sinalização não vê mais nada a partir daqui
```

### SDP (Session Description Protocol)

Um texto que descreve "o que eu sei fazer": codecs suportados (VP8, H264, Opus...), resoluções, se tenho áudio/vídeo/dados. O "offer" é a proposta de A, o "answer" é a resposta de B dizendo o que eles têm em comum.

### ICE (Interactive Connectivity Establishment)

O processo de achar um caminho de rede que funcione entre os dois peers, testando várias rotas possíveis (candidates):

- **host**: IP local da máquina (funciona só na mesma rede)
- **srflx** (server reflexive): IP público descoberto via STUN
- **relay**: endereço de um servidor TURN, usado quando nenhum caminho direto funciona

### STUN vs TURN

- **STUN**: servidor que responde "seu IP público visto de fora é X, porta Y". Só ajuda a *descobrir* o endereço — não participa da chamada depois. Leve, geralmente público e gratuito (ex: `stun.l.google.com:19302`).
- **TURN**: quando STUN não é suficiente (NAT muito restritivo, firewall corporativo), o TURN vira um **relay** — toda a mídia passa por ele. Funciona sempre, mas custa banda do servidor (ele fica no meio de cada pacote).

Neste projeto usamos STUN público sempre, e um TURN próprio (`coturn`) entra na Fase 3, quando o app é hospedado numa VPS para testar com pessoas em redes diferentes — ver `docs/projeto/arquitetura.md`.

### TURN com credenciais de curta duração

Em vez de embutir um usuário/senha fixos do TURN no HTML (visível a qualquer um que inspecionar a página), o coturn é configurado com `--use-auth-secret`, o esquema conhecido como "TURN REST API" (draft-uberti-behave-turn-rest): cliente e servidor compartilham um segredo (`static-auth-secret` no coturn, `webrtc.turn.secret` no backend); o backend gera, a cada carregamento de `room.html`, um `username` (um timestamp de expiração) e um `credential` = `HMAC-SHA1(segredo, username)` em Base64 (`TurnCredentialsService`). O coturn recalcula o mesmo HMAC ao receber uma tentativa de uso do relay e valida — sem precisar guardar nenhuma credencial em banco, e sem a credencial funcionar depois de expirada.

## Reconexão e ICE restart

Duas coisas diferentes podem cair numa chamada: o **WebSocket de sinalização** (a conexão com o backend) e uma **RTCPeerConnection** individual (a conexão direta com um peer).

- **Sinalização**: `signaling.js` reconecta sozinho com backoff exponencial se o WebSocket cair sem ter sido um `close()` intencional. Como o backend trata toda nova conexão como uma sessão nova (manda a lista de peers de novo, ver `docs/conceito/sinalizacao-websocket.md`), o cliente só precisa descartar as `RTCPeerConnection` antigas antes de processar essa lista de novo — senão o mesh duplicaria conexões.
- **RTCPeerConnection**: `iceConnectionState` passando para `failed` (não `disconnected`, que costuma se recuperar sozinho) dispara `pc.restartIce()` seguido de uma nova oferta SDP pelo canal de sinalização já existente — uma renegociação, não uma reconexão do zero.

## Compartilhamento de tela

Usa a mesma `RTCPeerConnection` já estabelecida. Ao invés de renegociar do zero, troca-se a track de vídeo com `sender.replaceTrack(novaTrackDaTela)`, onde a nova track vem de `getDisplayMedia()` em vez de `getUserMedia()`.

Quando o compartilhamento inclui áudio do sistema/aba, ele não *substitui* o microfone — as duas tracks de áudio (mic + sistema) são mixadas numa só via Web Audio API (`AudioContext` → dois `MediaStreamAudioSourceNode` → um `MediaStreamAudioDestinationNode` compartilhado), porque um sender de áudio da `RTCPeerConnection` só carrega uma track por vez. O resultado da mixagem é o que vai pro `replaceTrack`.

## Referências

- [WebRTC for the Curious](https://webrtcforthecurious.com/) — livro gratuito, a referência mais completa sobre ICE, STUN/TURN, SDP, DTLS/SRTP, capítulo por capítulo.
- [MDN — WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) — documentação de referência de cada método (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`, eventos).
- [webrtc.github.io/samples](https://webrtc.github.io/samples/) — demos oficiais do Google, uma isolada por API (peer connection básica, trickle ICE, data channels, captura de tela).
- `chrome://webrtc-internals` — abrir durante os próprios testes para ver o SDP real trocado e o estado do ICE (candidate pairs, se caiu em `host`, `srflx` ou `relay`).
