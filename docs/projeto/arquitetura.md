# Arquitetura do projeto

## Visão geral

```
NullPointerTalk/
  pom.xml
  src/main/java/com/nullpointertalk/     código Java
  src/main/resources/
    templates/   Thymeleaf (shell.html + fragments/icons.html)
    static/      CSS + JS puro, ES modules nativos (sem build, sem npm)
  docker-compose.yml   LiveKit (SFU de mídia, ver "Como as peças se conectam" abaixo)
  docs/
    conceito/   explicações dos conceitos usados, com referências
    projeto/    este conjunto de docs, sobre o código em si
```

Repositório único (sem subpasta `backend/`, sem frontend separado): o Spring Boot roda direto na raiz, renderiza as páginas com Thymeleaf e serve o JS puro que roda no navegador. Ver [`docs/projeto/backend.md`](backend.md) e [`docs/projeto/frontend.md`](frontend.md).

## Como as peças se conectam

```
┌───────────────────────────┐                                    ┌──────────────────────────┐
│  Navegador A               │   1. GET /room/{id}/token          │  Backend (Spring Boot)   │
│  (shell.html + JS puro)    │ ─────────────────────────────────► │                          │
│                             │ ◄───────────────────────────────  │  LiveKitTokenService      │
│  ┌──────────────────────┐  │   {token, url} (JWT HS256)         │  RoomTokenController      │
│  │ Room (livekit-client) │  │                                    │  AppShellController       │
│  └──────────┬───────────┘  │   3. GET /api/presence (polling)   │  PresenceService          │
│             │               │ ◄───────────────────────────────► │  RoomCatalog (salas fixas)│
│             │ 2. connect(url, token)                             └──────────────────────────┘
└─────────────┼─────────────┘
              │  uma única conexão WebRTC (WS + mídia UDP/SRTP)
              ▼
     ┌──────────────────────┐
     │  LiveKit (SFU)        │   recebe 1 upload de cada participante e reencaminha
     │  docker-compose        │   seletivamente pros outros - nunca decodifica/mixa
     └───────────┬───────────┘
                 │
     ┌───────────┴───────────┐
     │  Navegador B, C, ...   │  (mesmo esquema: 1 conexão cada, com o LiveKit)
     └────────────────────────┘
```

**Token de acesso** — `GET /room/{roomId}/token` (`RoomTokenController`) devolve um JWT assinado (`LiveKitTokenService`, HMAC-SHA256, sem depender do SDK de servidor do LiveKit) com um "video grant" pra aquela sala. O backend nunca participa da sinalização WebRTC propriamente dita nem vê mídia - só emite essa credencial.

**Presença** — `GET /api/presence` (`PresenceService`) é a única coisa que o backend consulta no LiveKit: ele chama a RoomService (API Twirp na mesma porta 7880) pra saber quem está em cada canal, e serve isso com cache. É o que permite a sidebar mostrar os participantes de canais em que a pessoa **não** está. Detalhes e armadilhas em [`docs/projeto/backend.md`](backend.md).

**Mídia e sinalização WebRTC** — inteiramente entre o navegador e o LiveKit, numa conexão só (`RTCPeerConnection` gerenciada internamente pelo `Room` do `livekit-client`). O LiveKit reencaminha os streams entre os participantes da sala (modelo SFU). Ver [`docs/conceito/webrtc.md`](../conceito/webrtc.md) (a seção de mesh P2P documenta o design anterior deste projeto, mantida como material de estudo).

## Por que essas escolhas

- **SFU (LiveKit) em vez de mesh P2P** — o projeto deixou de ser só um laboratório e passou a ser usado de verdade com amigos (VPS própria); mesh não escala além de poucos participantes e tem limitações reais de robustez (reconexão manual, sem controle de banda). LiveKit é open-source (Apache-2.0), self-hosted, maduro e resolve isso sem custo de licença.
- **Token JWT à mão** (`LiveKitTokenService`) em vez do SDK de servidor do LiveKit — é só um JWS HS256 com 4 claims; monta à mão evita depender de uma lib externa (e uma incerteza de compatibilidade com Jackson 3, usado neste projeto) só pra isso. Mesmo padrão que já era usado em `TurnCredentialsService` pro TURN do coturn.
- **`livekit-client` vendorizado** (bundle ESM em `static/js/vendor/`, sem npm) — mantém a decisão de não ter build step no frontend mesmo trazendo um SDK externo.
- **Thymeleaf + JS puro** em vez de um SPA (React/Vite) — sem necessidade de build ou estado global para uma tela de vídeo com salas fixas. Um módulo Maven só, sem CORS a configurar. O roteamento passou a ser no cliente (ver abaixo), mas isso custou ~60 linhas de History API, não um framework.
- **Shell persistente numa página só** (`GET /` e `GET /room/{id}` renderizam o mesmo template) — trocar de canal com reload custava nova permissão de mídia, chat zerado e uma espera artificial pela liberação da webcam. Sem reload, o `MediaStream` local é capturado uma vez e republicado, e a lista de canais nunca sai da tela. Ver [`docs/projeto/frontend.md`](frontend.md).
- **Polling de presença em vez de webhook + SSE** — os webhooks do LiveKit não têm garantia de entrega, então um `participant_left` perdido deixaria um fantasma permanente na sidebar e obrigaria a construir reconciliação periódica de qualquer forma. Somado a: uma terceira cópia da API key (no `livekit.yaml`, cujo `keys:` já é sobrescrito pelo `.env`), verificação de assinatura escrita à mão, e um mapa em memória que voltaria vazio a cada deploy. Com o cache single-flight, o polling custa ≤1 requisição em loopback por 1,5s independente de quantos navegadores estejam olhando.
- **Salas com CRUD, persistidas no Postgres** (`Room`/`RoomRepository`) — aberto a qualquer visitante, sem login (mesma filosofia do resto do app). `RoomSeeder` garante duas salas padrão (`estudos`, `jogos`) na primeira subida. O LiveKit continua criando a sala automaticamente no primeiro join, usando o `id` como nome; apagar uma sala chama `RoomService.DeleteRoom` (Twirp) pra derrubar quem estiver conectado.

## Persistência poliglota (implementada)

Postgres para `Room` (dado relacional, CRUD com integridade simples) e MongoDB para
`ChatMessage` (histórico append-only, cap de 250 mensagens por sala). Ver
[`docs/conceito/persistencia-poliglota.md`](../conceito/persistencia-poliglota.md) e
[`docs/projeto/backend.md`](backend.md). O chat de texto roda inteiramente por STOMP
(`docs/conceito/stomp.md`) — não usa mais o canal de dados do LiveKit.

## Deploy na VPS (LiveKit + nginx + TLS)

Para chamadas reais entre pessoas em redes diferentes:

- `livekit` sobe como serviço no `docker-compose.yml`, com `network_mode: host` (precisa da faixa de portas UDP de mídia alcançável de fora) e config em `livekit/livekit.yaml`, que já inclui TURN embutido (substitui o antigo `coturn` standalone).
- Perfil `vps` (`application-vps.properties`) aponta `livekit.url` pro subdomínio público (`wss://livekit.SEUDOMINIO`) e usa a mesma `keys:` do `livekit.yaml`.
- O nginx que já termina TLS na 443 pro backend (porta 8080) precisa de uma rota extra: um subdomínio (`livekit.SEUDOMINIO`, com seu próprio registro DNS) proxiando pra `127.0.0.1:7880` com headers de upgrade de WebSocket, e certificado próprio (certbot/Let's Encrypt) - LiveKit exige TLS válido em produção (WSS), não dá pra usar autoassinado sem os visitantes verem aviso de segurança.
- A presença faz chamadas servidor→servidor no LiveKit (`livekit.api-url`, vazio por padrão = derivado de `livekit.url`). Sem sobrescrever isso na VPS, o backend dá a volta pelo DNS público + nginx + TLS a cada 1,5s só pra falar com o processo vizinho (mesma máquina, `network_mode: host`) — e a presença cairia junto se o certificado vencesse. Vale adicionar `livekit.api-url=http://localhost:7880` direto no `application-vps.properties` daquele ambiente - a mesma cópia hoje mantida à mão na VPS, com `livekit.api-key`/`livekit.api-secret` reais.
- Com o `livekit.api-url` em loopback, dá pra **negar `/twirp/` no nginx** (`location /twirp/ { deny all; }`) — senão a API de administração do LiveKit fica alcançável da internet. **A ordem importa**: o loopback precisa estar valendo antes de negar, senão a presença para.
- O range de portas UDP de mídia (`rtc.port_range_start/end` no `livekit.yaml`) e a porta TURN (3478) precisam estar abertos direto no firewall da VPS - isso **não** passa pelo nginx (nginx só faz proxy de HTTP/WebSocket, não de RTP puro).
- **Importante sobre ngrok**: só a sinalização (WSS) tunela por ngrok - a mídia é UDP puro e ngrok não encaminha UDP. Pra chamadas de verdade (não só teste solo local) o alvo tem que ser a VPS com IP público e porta UDP aberta.

## Ver também

- [`docs/projeto/backend.md`](backend.md) — estrutura de pacotes do backend
- [`docs/projeto/frontend.md`](frontend.md) — estrutura de pastas do frontend
- `README.md` na raiz — instruções de como rodar
