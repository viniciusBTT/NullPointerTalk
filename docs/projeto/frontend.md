# Frontend: Thymeleaf + JavaScript puro

Sem projeto separado, sem build, sem npm — o próprio Spring Boot serve a página (Thymeleaf), o CSS e o JS (`src/main/resources/`), no mesmo repositório/módulo Maven do backend. WebRTC e as APIs de mídia (`getUserMedia`, `getDisplayMedia`) são nativas do navegador, então não dependem de framework nenhum; a decisão aqui foi só sobre quem renderiza o HTML.

## Por que Thymeleaf + JS puro (e não React/Vite)

Projeto de laboratório para estudar tempo real na web — não precisa da complexidade de um SPA com build próprio e gerenciamento de estado tipo Redux para uma tela de vídeo com salas fixas. Um único módulo Maven simplifica: sem CORS (mesma origem), sem processo `npm run dev` paralelo, sem passo de bundling. Os scripts usam ES modules nativos do navegador (`<script type="module">`), com `import` relativo entre arquivos.

O roteamento **é** feito no cliente (History API), mas isso não exige framework: são ~60 linhas em `core/router.js`. Ver "Shell persistente" abaixo.

## Shell persistente: uma página, sem reload

Antes eram duas páginas (`home.html` e `room.html`) com navegação de verdade entre elas. Trocar de sala custava um reload completo: nova permissão de câmera, chat zerado, e um `setTimeout(150ms)` antes de navegar porque o driver da webcam não libera o dispositivo instantaneamente.

Agora **`GET /` e `GET /room/{roomId}` renderizam o mesmo template** (`shell.html`, via `AppShellController`). Entrar e trocar de canal acontece por JS, sem reload:

- a lista de canais fica sempre visível (é a coisa que mais faltava em relação ao Discord);
- o `MediaStream` local é capturado **uma vez** e republicado na sala nova, o que elimina a corrida de liberação de dispositivo — e com ela a gambiarra do `setTimeout`;
- tela compartilhada e "ouvir junto" são carregados pro canal novo, sem re-escolher a janela;
- `history.pushState` mantém `/room/<id>` compartilhável, e um link direto funciona porque o servidor devolve a aplicação inteira com aquele canal já marcado como ativo.

## Estrutura

```
src/main/resources/
  templates/
    shell.html            # o shell inteiro: rail, sidebar, stage, chat, modais
    fragments/icons.html  # sprite SVG, inlinado no <body>
  static/
    css/                  # 6 arquivos, 6 <link> (sem @import, que serializa o download)
      tokens.css          # ÚNICO lugar com cor/forma/medida (paleta dark estilo Discord)
      base.css            # reset, tipografia, botões, formulários, .hidden global
      shell.css           # grid do shell, rail, sidebar, painel de voz, controles
      stage.css           # grade de vídeo, tiles, modo foco, badges
      chat.css            # mensagens, agrupamento, separador de dia, composer
      overlays.css        # modais, popover, toasts, banners
    js/
      app.js              # entry: constrói os módulos, liga os eventos, boota
      core/
        voice-session.js  # ÚNICO módulo que importa o SDK do LiveKit. EventTarget.
        local-media.js    # dono do MediaStream local pelo ciclo de vida da página
        audio-sink.js     # <audio> oculto por publicação remota; volume, surdo, desbloqueio
        chat-store.js     # buffer de mensagens por canal + não-lidas
        presence.js       # polling de /api/presence
        router.js         # pathname <-> canal, pushState/popstate
        identity.js       # nome de exibição + identity estável
      ui/
        sidebar.js  voice-panel.js  stage.js  tile.js  chat.js
        settings-modal.js  participant-popover.js  name-gate.js
      lib/
        media.js  screenshare.js  ui-feedback.js
        prefs.js  dom.js  avatar.js  icons.js  sounds.js
      vendor/
        livekit-client.esm.min.js  # SDK vendorizado (sem npm/build) - ver vendor/README.md
```

## Como as peças se conectam

O controle é unidirecional: a UI chama métodos em `session`/`audioSink`/`chatStore`, e eles respondem por **evento**. Nenhum módulo de UI lê o DOM de outro.

- **`core/voice-session.js` é a espinha da voz.** É o único arquivo que conhece o SDK do LiveKit (áudio/vídeo/tela - o chat não passa mais por aqui, ver abaixo). Expõe `join`/`leave`/`setMicEnabled`/`setCameraEnabled`/… e emite `statechange`, `joined`, `left`, `participants`, `tracks`, `speakers`, `localstate`, `error`, `kicked`… Os objetos que ele publica (`ParticipantView`, `PubView`) são dados simples; onde a UI precisa da track de verdade (anexar num `<video>`, mudar volume), o `PubView` carrega closures `attach`/`detach`/`setVolume`. É isso que mantém a regra "só este arquivo importa `vendor/livekit-client...`" verificável de relance. `kicked` é emitido quando o LiveKit derruba a conexão com `DisconnectReason.ROOM_DELETED` (sala apagada via CRUD) - distinto do caminho genérico de erro/reconexão, porque oferecer "Reconectar" numa sala que não existe mais seria enganoso.
- **`core/chat-session.js` é a espinha do chat.** Fala STOMP com o backend (`/ws/chat`), independente do ciclo de vida da voz: assina o tópico de **todas** as salas do catálogo (mais `/topic/room-catalog`, pro CRUD de salas) já ao conectar, não só a sala atualmente aberta - é isso que permite badge de não-lida numa sala onde a pessoa não está com a voz ligada. O painel de chat visível continua 1:1 com a sala ativa (entrar numa sala ainda faz `router.navigate` + `session.join` juntos); só a camada de transporte/assinatura ficou desacoplada. Ver [`docs/conceito/stomp.md`](../conceito/stomp.md).
- **Identidade**: `<userId>.<tabNonce>`. O `userId` é um uuid persistido em `localStorage` — sem ele, um F5 criaria uma identity nova e a pessoa apareceria duplicada na presença até o servidor notar a conexão morta. O nonce por aba é **obrigatório**: o LiveKit derruba o participante existente quando uma identity duplicada entra na mesma sala, então um id estável puro faria duas abas se expulsarem. O `userId` é também a chave de volume por participante, "silenciar pra mim" e cor de avatar.
- **Nome do usuário**: sem login — `localStorage` (`npt.username`), acessado só via `lib/prefs.js`. Trocar o nome usa `localParticipant.setName()` (não reconecta), o que exige o grant `canUpdateOwnMetadata` no token.
- **Canais**: hoje dinâmicos (CRUD via `RoomController`), mas o boot ainda lê o catálogo embutido no HTML - `AppShellController` monta `roomsJson` a partir do `RoomRepository` (Postgres) e o `<ul id="channel-list">` nasce **vazio**, populado por `sidebar.addChannel()` a partir desse mesmo atributo. O catálogo vai pro JS num atributo `data-rooms` — **não** em `<script type="application/json">`, porque o conteúdo de `<script>` é parseado em *script data state*, que não decodifica character references, e o `&quot;` escapado pelo Thymeleaf quebraria o `JSON.parse`. Criações/edições/exclusões depois do boot chegam via `/topic/room-catalog` (STOMP) e `sidebar.addChannel/renameChannel/removeChannel` atualizam a lista sem reload - um reload derrubaria a própria voz de quem só estava mexendo numa sala diferente.
- **Áudio**: um `<audio>` oculto por publicação remota, chaveado por `trackSid` (não por identity: alguém pode ter microfone + áudio de tela + "ouvir junto" ao mesmo tempo). Áudio local nunca é anexado. Desbloqueio de autoplay via `RoomEvent.AudioPlaybackStatusChanged` + `room.startAudio()`.
- **Tiles**: um por par (participante, fonte), então câmera e tela compartilhada são tiles **independentes** — antes havia um `<video>` por participante e a tela substituía a câmera. O stage só existe quando alguém está transmitindo imagem; numa conversa só de voz o chat ocupa a coluna inteira e a sidebar é quem mostra quem está lá.
- **Presença**: o canal em que a pessoa está vem dos eventos do LiveKit (instantâneos); os **outros** canais vêm do polling de `GET /api/presence`. Isso tira o poll do caminho crítico de latência. Ver [`docs/projeto/backend.md`](backend.md).
- **Ícones**: sprite SVG inlinado, com `stroke="currentColor"` — estado (mutado = vermelho, ativo = accent) é só trocar a cor do container, sem um ícone por estado. Inlinado e não em arquivo externo porque `<use>` externo cria uma shadow tree que o CSS do documento não alcança.
- **Zero `innerHTML` no codebase.** Todo texto passa por `lib/dom.js` (`el({ text })` → `textContent`). É uma invariante muito mais fácil de revisar que "innerHTML só pra string estática".
- **Ícone de sala**: escolhido por uma modal (`ui/icon-picker.js`) sobre uma grade estática de emojis curados (`ROOM_ICON_CATALOG`, uma constante JS, sem endpoint nem tabela no Postgres). O `<input id="room-form-icon">` continua sendo a única fonte de verdade do valor — a modal só lê esse valor para destacar a opção correspondente ao abrir, e escreve nele ao escolher uma opção — o que preserva de graça ícones legados fora do catálogo (o input mantém qualquer texto livre já salvo) e o cancelamento sem efeito (fechar sem escolher nada nunca escreve no input).

## Chat persistido e não-lidas entre reloads

O chat já não depende do canal de dados do LiveKit - é STOMP + MongoDB (ver
[`docs/conceito/stomp.md`](../conceito/stomp.md) e `docs/projeto/backend.md`). `core/chat-store.js`
deixou de ser a única fonte de verdade: `ensureHistory(roomId)` busca as últimas 250 mensagens
persistidas (`GET /api/rooms/{roomId}/messages`) na primeira vez que uma sala é aberta na sessão,
e mensagens ao vivo continuam chegando via `core/chat-session.js` e sendo acrescentadas por
`append()` (dedup por id cobre a sobreposição entre as duas fontes).

Não-lidas sobrevivem a um reload porque o critério de "lido até onde" é um **timestamp
persistido em `localStorage`** (`lib/prefs.js`, `KEYS.chatLastRead`), e não um contador só em
memória: `markRead(roomId, timestamp)` grava o timestamp da mensagem mais recente conhecida
(vindo do relógio do servidor, não `Date.now()` - imune a desincronia de relógio entre
cliente e backend), e no boot cada sala é conferida via
`GET /api/rooms/{roomId}/messages?after=<último lido>` pra saber quantas mensagens novas
existem desde então. Como `ChatSession` assina o tópico de todas as salas (não só a ativa), o
badge de não-lida funciona pra qualquer canal, não só o que está com a voz conectada.

## Cache dos assets

`spring.web.resources.cache.cachecontrol.no-cache=true` força revalidação. Fingerprint por hash de conteúdo (`spring.web.resources.chain.strategy.content`) **não funciona aqui**: ele só reescreve URLs que passam pelo `@{...}` do Thymeleaf, e o `import './media.js'` de um ES module nativo é resolvido pelo próprio navegador contra o caminho sem fingerprint — reescrever isso exigiria um build step, que é justamente o que este projeto não tem. Cada módulo custa um GET condicional que responde 304 sem corpo, e nunca há risco de servir JS velho depois de um deploy.

## Rodar localmente

Não há passo separado — sobe junto com o backend:

```bash
./mvnw spring-boot:run   # http://localhost:8080
```
