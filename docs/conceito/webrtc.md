# WebRTC: mesh P2P, SDP, ICE, STUN/TURN

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

Neste projeto usamos só STUN público por enquanto (testes em localhost/mesma rede). Quando for para uma VPS testar com pessoas em redes diferentes, um TURN próprio (`coturn`) provavelmente será necessário — ver `docs/projeto/arquitetura.md`.

## Compartilhamento de tela

Usa a mesma `RTCPeerConnection` já estabelecida. Ao invés de renegociar do zero, troca-se a track de vídeo com `sender.replaceTrack(novaTrackDaTela)`, onde a nova track vem de `getDisplayMedia()` em vez de `getUserMedia()`.

## Referências

- [WebRTC for the Curious](https://webrtcforthecurious.com/) — livro gratuito, a referência mais completa sobre ICE, STUN/TURN, SDP, DTLS/SRTP, capítulo por capítulo.
- [MDN — WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API) — documentação de referência de cada método (`RTCPeerConnection`, `getUserMedia`, `getDisplayMedia`, eventos).
- [webrtc.github.io/samples](https://webrtc.github.io/samples/) — demos oficiais do Google, uma isolada por API (peer connection básica, trickle ICE, data channels, captura de tela).
- `chrome://webrtc-internals` — abrir durante os próprios testes para ver o SDP real trocado e o estado do ICE (candidate pairs, se caiu em `host`, `srflx` ou `relay`).
