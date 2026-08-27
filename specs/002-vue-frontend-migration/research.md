# Research: Migração do Frontend para Vue.js

## 1. Integração do build do frontend ao Maven

**Decision**: usar `frontend-maven-plugin` (com.github.eirslett) no `pom.xml`, com versão do
Node.js fixada, executando `npm ci` e `npm run build` na fase `generate-resources`. O
`maven-resources-plugin` copia `frontend/dist/**` para `target/classes/static` antes do
empacotamento do jar.

**Rationale**: mantém um único comando de build/deploy para o repositório inteiro
(`./mvnw clean package`), sem exigir Node.js instalado globalmente na máquina de quem só quer
rodar/buildar o backend — preserva o espírito do Princípio I/II (app trivial de buildar e rodar).

**Alternatives considered**:
- Script bash externo chamando `npm` antes do Maven — rejeitado por quebrar o "único comando"
  hoje garantido por `./mvnw spring-boot:run`/`./mvnw package`.
- Pipeline de CI separado buildando frontend e backend independentemente e publicando artefatos
  distintos — rejeitado por reabrir a classe de problema que o Princípio II original evitava
  (dessincronia de versão entre frontend e backend implantados separadamente).

## 2. Roteamento SPA e substituição do shell Thymeleaf

**Decision**: `vue-router` em modo `history`, com as rotas `/` e `/room/:roomId`. O
`AppShellController` mantém exatamente os dois `@GetMapping` que já existem hoje (`/` e
`/room/{roomId}`), mas passa a retornar `forward:/index.html` (o `index.html` gerado pelo Vite)
em vez de renderizar o template Thymeleaf `shell.html` — sem `Model`, sem `roomsJson`, sem
`activeRoom`. O catálogo de salas deixa de ser injetado via atributo `data-rooms` e passa a ser
buscado pelo frontend via um novo endpoint `GET /api/rooms` no boot do app (ver "Novo endpoint de
listagem" abaixo). O redirecionamento hoje feito no servidor para `roomId` desconhecido
(`return "redirect:/"` em `AppShellController.room()`) passa para o client-side: o guard de rota
do Vue Router verifica, após carregar o catálogo, se o `roomId` da URL existe; se não existir,
navega para `/`.

**Novo endpoint de listagem — `GET /api/rooms`**: `RoomController` hoje **não** tem essa rota de
propósito — o comentário no código é explícito: o servidor já tinha a lista em mãos ao renderizar
o HTML, então um `/api/rooms` seria uma segunda fonte de verdade pras mesmas 4 linhas. Essa razão
deixa de existir quando o shell vira uma SPA estática sem renderização server-side: agora só o
endpoint REST tem a lista, então ele precisa existir. Adicionar
`GET /api/rooms → List<RoomInfo>` (mesmo formato que já é serializado hoje pra `roomsJson`,
reusando `RoomCatalog.all()`) é a única mudança de contrato desta migração — todo o resto de
`RoomController`, `ChatHistoryController`, `PresenceController`, `RoomTokenController` e
`ChatController` continua exatamente como está.

**Rationale**: elimina a necessidade de o backend conhecer/templatizar dados de sala no HTML —
Thymeleaf deixa de ser necessário para servir o shell — sem duplicar lógica de catálogo entre
servidor e cliente: com o shell estático, `GET /api/rooms` passa a ser a única fonte de verdade,
não uma segunda. Manter apenas as duas rotas explícitas que já existem em `AppShellController`
(em vez de um catch-all genérico para qualquer path) segue o Princípio I/YAGNI: não há hoje
nenhuma outra forma de URL profunda a suportar.

**Alternatives considered**:
- Um controller catch-all (`/**`) fazendo forward de qualquer rota não-API para o `index.html` —
  rejeitado por resolver um problema hipotético (rotas futuras ainda não definidas) que a fase
  atual não pede.
- Manter Thymeleaf processando um `index.html` gerado pelo Vite, para continuar injetando
  `data-rooms` sem precisar de um novo endpoint — rejeitado por acoplar o build estático do Vite
  a um template server-side, só pra evitar uma única rota REST simples que a nova arquitetura já
  torna necessária de qualquer forma (a sidebar, hoje já aberta, também precisa recarregar o
  catálogo em algum momento do ciclo de vida do app, não só no primeiro load).
- Buscar o catálogo inicial só via STOMP, assinando `/topic/room-catalog` — rejeitado porque esse
  tópico só publica eventos de `created`/`updated`/`deleted` a partir do momento da assinatura,
  sem replay do estado atual; não serve como fonte do snapshot inicial.

## 3. Cliente STOMP/WebSocket e LiveKit

**Decision**: substituir os arquivos vendorizados `static/js/vendor/stomp.umd.min.js` e
`static/js/vendor/livekit-client.esm.min.js` pelas dependências npm oficiais `@stomp/stompjs` e
`livekit-client`, declaradas no `package.json` do `frontend/`.

**Rationale**: elimina a vendorização manual de arquivos minificados no repositório; o Vite
resolve, faz bundling/tree-shaking e versiona essas bibliotecas como qualquer outra dependência —
prática padrão do ecossistema Vue/Vite, sem mudar o papel de nenhuma das duas libs (STOMP para
chat persistente, LiveKit para todo o transporte de mídia — Princípio III inalterado).

**Alternatives considered**:
- Manter os arquivos vendorizados como assets estáticos importados diretamente — rejeitado por
  não se beneficiar de bundling/versionamento do Vite e destoar da prática padrão do ecossistema.

## 4. Configuração do Tailwind CSS

**Decision**: Tailwind CSS v4 via plugin `@tailwindcss/vite`, com um único arquivo
`frontend/src/assets/main.css` contendo `@import "tailwindcss";` — sem arquivo de configuração
obrigatório (convenção v4 de configuração via CSS quando não há necessidade de customização de
tema além do padrão).

**Rationale**: menor superfície de configuração para o mesmo resultado (Princípio I/YAGNI),
integração nativa com Vite sem exigir PostCSS configurado manualmente.

**Alternatives considered**:
- Tailwind CSS v3 com `tailwind.config.js` + PostCSS — mais peças móveis para o mesmo resultado,
  sem ganho concreto para o escopo desta migração.

## 5. Estratégia de testes de frontend

**Decision**: Vitest + `@vue/test-utils` para stores Pinia e composables com lógica não trivial
(ex.: reconciliação de presença ao entrar/sair de participantes, transições de estado da sessão
de voz). Fluxos completos de tela são validados manualmente via `quickstart.md`, contra os
critérios de sucesso SC-001 a SC-005 da especificação.

**Rationale**: espelha a regra já existente na constituição para o backend ("todo service ou
controller com regra de negócio não trivial DEVE ganhar teste antes de ser considerado
concluído"), aplicada ao equivalente de frontend, sem introduzir uma suíte E2E automatizada
(Playwright/Cypress) que a fase atual não pede.

**Alternatives considered**:
- Suíte E2E automatizada completa desde já — descartada por ora (Princípio V: complexidade só
  quando a fase de estudo pedir); pode ser revisitada numa fase futura se regressões de UI se
  tornarem recorrentes.

## 6. Fluxo de desenvolvimento local (dois processos em dev, um em produção)

**Decision**: em desenvolvimento, `frontend/` roda com seu próprio dev server (`npm run dev`,
Vite), configurado para fazer proxy de `/api`, `/ws` e `/room/*/token` para
`http://localhost:8080` (backend rodando via `./mvnw spring-boot:run` num segundo terminal). Em
produção, `./mvnw clean package` já embute o build do frontend no jar final — um único processo
Spring Boot é servido.

**Rationale**: é o único jeito de obter hot-reload real (SC-002) — `spring-boot:run` (goal de
plugin) não executa a fase `generate-resources` do frontend a cada mudança de arquivo do
frontend. A origem única em runtime (Princípio II) é uma garantia de produção, não uma exigência
de que dev também rode como processo único — o próprio backend já roda separado do Postgres/Mongo/
LiveKit em dev hoje (`docker compose up -d ...` + `./mvnw spring-boot:run`), então introduzir mais
um processo local para o frontend segue o mesmo padrão já aceito no projeto.

**Alternatives considered**:
- Rodar `mvn generate-resources` a cada alteração de arquivo do frontend, sem dev server dedicado
  — rejeitado por não entregar hot-reload (SC-002 exigiria refresh manual completo, o mesmo
  problema que esta migração busca resolver).
