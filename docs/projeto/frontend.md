# Frontend: Vue.js 3 + TypeScript + Pinia + Vite + Tailwind CSS

Projeto Vite independente em `frontend/`, na raiz do mono repo, ao lado do módulo Maven do
backend. Em produção o `mvn package` builda o frontend e embute o resultado estático no jar do
Spring Boot — só um processo é servido, a partir de uma única origem. Em desenvolvimento, o
Vite roda como um segundo processo com hot-reload, proxiando `/api`, `/ws` e `/room/*/token` pro
backend. Ver [`../../specs/002-vue-frontend-migration/`](../../specs/002-vue-frontend-migration/)
para o histórico completo da decisão (spec, plano, pesquisa).

## Por que migrar de Thymeleaf + JS puro

O frontend anterior (documentado no histórico do Git) já tinha crescido pra ~30 módulos ES
nativos coordenados manualmente por `app.js`, com estado de UI espalhado por closures
(`chat-store.js`, `presence.js`, `voice-session.js`) e sincronização manual entre eles e o DOM.
Isso deixou de ser proporcional ao problema: Vue + Pinia dá um modelo declarativo de
componente/estado sem introduzir complexidade que a fase atual não pede (nenhum framework de UI
além do Vue, nenhuma suíte E2E automatizada ainda — ver `research.md` da spec da migração).

A troca exigiu emendar a constituição do projeto (Princípio II, v2.0.0): "mono repo com backend
como origem única em runtime" passou a admitir um passo de build de frontend integrado ao Maven,
em vez de exigir que o próprio Spring Boot renderizasse o HTML.

## Estrutura

```
frontend/
  src/
    main.ts                  # bootstrap: createApp + Pinia + vue-router
    App.vue                  # shell inteiro (rail, sidebar, stage, chat, modais) — persistente
    router/index.ts          # rotas "/" e "/room/:roomId" — SEM <router-view>: o shell não pode
                              #   ser desmontado ao trocar de sala (a sessão de voz/chat teria
                              #   que reconectar do zero). O router só sincroniza a URL/roomId
                              #   ativo; App.vue reage via watch(route.params.roomId).
    stores/                  # Pinia — fonte única de verdade
      identity.ts            # displayName, stableUserId, prefs de mic/câmera (localStorage)
      presence.ts            # catálogo de salas + presença (polling + eventos ao vivo)
      chat.ts                # histórico, mensagens ao vivo, não-lidas
      voice.ts               # ÚNICO módulo que importa livekit-client
    composables/
      useLocalMedia.ts       # dono do MediaStream local pelo ciclo de vida da página inteira
      useAudioSink.ts        # <audio> oculto por publicação remota; volume, surdo
      useScreenShare.ts      # getDisplayMedia (tela e "ouvir junto")
      useSounds.ts           # beeps de entrada/saída (Web Audio API)
      useUiFeedback.ts       # toasts/banners (estado reativo compartilhado)
      useBrowserSupport.ts   # checagem de WebRTC/WebSocket no boot
    components/
      sidebar/    Sidebar, ChannelList, VoicePanel, RoomAdminModal
      stage/      Stage, ParticipantTile, ParticipantPopover
      chat/       ChatPanel
      overlays/   NameGate, SettingsModal, IconPicker, ToastHost
      Icon.vue, IconSprite.vue, Avatar.vue
    api/                     # clientes REST/STOMP (ver contracts/backend-api.md da spec)
      http.ts  rooms.ts  chatHistory.ts  presence.ts  roomToken.ts  chatSocket.ts
    lib/                     # funções puras sem estado de framework
      avatar.ts  icons.ts  roomIcons.ts  prefs.ts
  tests/unit/stores/          # Vitest — stores com lógica não trivial
  vite.config.ts               # plugin Tailwind + proxy de dev pro backend

src/main/java/com/nullpointertalk/room/
  AppShellController.java     # "/" e "/room/{roomId}" -> forward:/index.html (SPA estática)
  RoomController.java         # + GET /api/rooms (novo — catálogo inicial da SPA)
```

## Como as peças se conectam

O fluxo de dados é o padrão Pinia: componentes leem stores reativamente e chamam ações; stores
não conhecem componentes. Os composables (`useLocalMedia`, `useAudioSink`, `useSounds`) são
estado em nível de módulo (não por instância de componente) porque precisam sobreviver a troca de
tela/rota — o mesmo motivo que os justificava como classes instanciadas uma vez em `app.js` na
versão anterior.

- **`stores/voice.ts` é a espinha da voz**, porte de `core/voice-session.js`. Único módulo que
  importa `livekit-client`. Expõe `state` (`idle|joining|connected|reconnecting`), `participants`,
  `videoPubs`/`audioPubs` (recomputados em lote por microtask, não a cada evento do SDK — evita
  redesenhar o grid inteiro numa rajada de eventos ao entrar numa sala cheia) e ações
  (`join`/`leave`/`setMicEnabled`/…). Eventos pontuais (`joined`, `left`, `kicked`, `error`,
  `participantjoined/left`) saem por um pequeno barramento (`voice.on(callback)`), consumidos só
  em `App.vue` pra disparar toasts/sons/navegação — os componentes de tela nunca leem esse
  barramento diretamente, só o estado reativo.
- **Geração + fila de join preservadas**: cliques rápidos entre canais não abrem conexões
  órfãs — cada `join()` incrementa um contador de geração; qualquer passo assíncrono de uma
  chamada antiga aborta silenciosamente ao notar que uma geração mais nova já começou. Ver o
  comentário em `stores/voice.ts#join`.
- **`stores/chat.ts`** assina `/topic/room/{roomId}` de **todas** as salas do catálogo (não só a
  aberta) — é o que permite badge de não-lida num canal onde a voz não está conectada. Exporta
  `unread(roomId)`/`unreadCounts` como única fonte, consumida tanto por `ChannelList` (badge)
  quanto por `ChatPanel`, sem lógica duplicada (US3 da spec da migração).
- **`stores/presence.ts`** funde duas fontes: o canal onde a própria voz está conectada vem do
  LiveKit (instantâneo, via `setLive()`, chamado de `App.vue` a partir de `voice.participants`);
  os demais canais vêm do polling de `GET /api/presence`, com backoff exponencial quando a
  resposta chega marcada como `stale` (header `X-Presence-Stale`).
- **Identidade** (`stores/identity.ts`): `<userId>.<tabNonce>`, mesmas chaves de `localStorage`
  de antes (`npt.username`, `npt.userId`) — preferências de quem já usava o app continuam válidas
  (FR-007 da spec).
- **`useAudioSink`**: um `<audio>` oculto por publicação remota, chaveado por `trackSid` — criado
  fora da árvore de componentes (anexado direto a `document.body`) porque precisa sobreviver a
  qualquer remontagem de tela.
- **Tiles do stage**: um por par (participante, fonte) — câmera e tela compartilhada de uma
  mesma pessoa são tiles independentes. `ParticipantTile.vue` anexa a track só uma vez (`onMounted`)
  e nunca reanexa em atualizações — importante porque `adaptiveStream` do LiveKit usa
  `IntersectionObserver` e pausaria a track se o tile fosse escondido em vez de desmontado
  (por isso o stage usa `v-if`/remoção real de elemento, nunca `v-show`, pra tiles de vídeo).
- **Zero `v-html`** no codebase — interpolação padrão do Vue já escapa texto (mensagens de chat,
  nomes de participantes), preservando a invariante "zero innerHTML" da versão anterior sem
  esforço extra.

## Dev vs. produção

| | Dev | Produção |
|---|---|---|
| Processos | 2 (`./mvnw spring-boot:run` + `npm run dev`) | 1 (jar do Spring Boot) |
| Frontend servido por | Vite (`:5173`, hot-reload) | Spring Boot (`:8080`, estático) |
| API/WebSocket | proxiados pelo Vite pro backend | mesma origem |

Ver [`../../specs/002-vue-frontend-migration/quickstart.md`](../../specs/002-vue-frontend-migration/quickstart.md)
para o roteiro completo de validação (paridade funcional, hot-reload, build de produção).

## Testes

Vitest + `@vue/test-utils` para stores com lógica não trivial (`frontend/tests/unit/stores/`) —
mesma exigência já existente na constituição pro backend, aplicada ao equivalente de frontend.
Fluxos de tela completos continuam validados manualmente (roteiro do quickstart), sem suíte E2E
automatizada por ora.
