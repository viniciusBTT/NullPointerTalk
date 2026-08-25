<!--
Sync Impact Report
- Version change: (template, unratified) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections:
  - Core Principles: I. Minimalismo e Sem Dependência Desnecessária (YAGNI); II. Monólito de
    Origem Única (Sem Frontend Separado); III. Mídia Sempre via SFU Self-Hosted; IV. Documentação
    da Decisão Antes/Junto da Implementação; V. Fases Explícitas, Complexidade Só Quando a Fase
    Pedir
  - Stack Tecnológica & Ambiente
  - Fluxo de Desenvolvimento
  - Governance
- Removed sections: none (previous file was the unfilled template scaffold)
- Deferred placeholders: none
- Templates checked:
  - .specify/templates/plan-template.md — has a generic "Constitution Check" gate; no
    principle-specific text to sync, no edit needed (out of scope for this command regardless).
- Follow-up TODOs: none
-->

# NullPointerTalk Constitution

## Core Principles

### I. Minimalismo e Sem Dependência Desnecessária (YAGNI)

Toda dependência, biblioteca ou camada de abstração adicionada DEVE resolver uma necessidade
real da fase de estudo atual — nunca uma necessidade hipotética futura. Prefira a solução mais
simples que funcione a um framework ou camada extra "por precaução". Decisões de minimalismo já
tomadas (sem SPA, sem build de frontend, sem autenticação com senha) só devem ser revertidas
quando a fase de estudo em curso exigir isso de fato, não por antecipação.

Rationale: o objetivo do projeto é aprender comunicação em tempo real na web, não maximizar
arquitetura; complexidade não essencial desvia foco do aprendizado e aumenta o custo de manter
o laboratório rodando.

### II. Monólito de Origem Única (Sem Frontend Separado)

O projeto É um único módulo Maven na raiz do repositório: o Spring Boot serve páginas
(Thymeleaf), estáticos (JavaScript puro) e WebSocket a partir da mesma origem. Não introduzir um
segundo processo de build (SPA/bundler) nem configuração de CORS para contornar múltiplas
origens. O JavaScript do cliente é puro (sem framework de UI); necessidade de estado mais
complexo DEVE ser resolvida dentro do shell de página única existente antes de se considerar
uma reescrita para outro modelo de frontend.

Rationale: elimina uma classe inteira de problemas (build duplo, CORS, dessincronia de versões)
irrelevantes ao objetivo de estudo, e mantém o app trivial de rodar localmente
(`./mvnw spring-boot:run`).

### III. Mídia Sempre via SFU Self-Hosted, Nunca no Backend da Aplicação

Todo tráfego de áudio/vídeo/tela DEVE passar pelo LiveKit (SFU self-hosted); o backend da
aplicação NUNCA processa SDP/ICE/mídia diretamente. O backend só emite tokens de acesso (JWT
HS256, via `LiveKitTokenService`) por sala/participante — negociação e reconexão (retry de
ICE/DTLS) são responsabilidade do `livekit-client`, e NÃO DEVEM ser reimplementadas
manualmente na aplicação. STUN/TURN são resolvidos pela infraestrutura do próprio LiveKit, sem
componentes adicionais (ex.: `coturn` separado).

Rationale: manter uma fronteira clara entre "sinalização/autorização" (responsabilidade do
backend) e "transporte de mídia" (responsabilidade do LiveKit) é o próprio conceito que este
projeto existe para estudar, e evita reimplementar, com bugs, lógica de baixo nível de WebRTC
que a biblioteca já resolve.

### IV. Documentação da Decisão Antes/Junto da Implementação

Toda decisão arquitetural ou de conceito não-trivial DEVE ser registrada em `docs/projeto/`
(como o código/estrutura funciona) ou `docs/conceito/` (explicação do conceito, com
referências) — antes ou junto do commit que a implementa. Referências externas usadas para
embasar a decisão (specs, artigos, guias oficiais) DEVEM ser citadas na documentação, não
apenas mencionadas em mensagens de commit ou de PR.

Rationale: como projeto de estudo, o valor não está só em "funcionar", mas em registrar o
porquê — a documentação é o artefato de aprendizado, não um efeito colateral do código.

### V. Fases Explícitas, Complexidade Só Quando a Fase Pedir

Funcionalidades futuras já identificadas (ex.: persistência poliglota, CRUD de salas) só entram
quando a fase de estudo correspondente começar de fato — não antecipar implementação "para não
ter que voltar depois". Toda simplificação deliberada atual (ex.: salas fixas, sem login) é uma
decisão registrada, não uma lacuna a corrigir por padrão; alterá-la exige justificar por que a
fase de estudo atual passou a exigir isso.

Rationale: evita que o projeto vire um produto real por acidente antes de esgotar o valor de
aprendizado de cada fase, e evita retrabalho de antecipar features fora da ordem do que está
sendo estudado no momento.

## Stack Tecnológica & Ambiente

- **Backend**: Java 21, Spring Boot (Maven), módulo único na raiz do repositório — sem
  subpasta `backend/`.
- **Frontend**: Thymeleaf + JavaScript puro, servidos pelo próprio Spring Boot (sem build
  separado, sem framework de UI).
- **Mídia**: LiveKit (SFU self-hosted) via `docker-compose.yml`; TURN embutido no LiveKit.
- **Persistência**: PostgreSQL para dados relacionais (Room, Participant) via Spring Data JPA;
  MongoDB para histórico de chat via Spring Data MongoDB.
- **Mensageria**: STOMP sobre WebSocket (SockJS) para chat e sinalização de presença.
- **Identidade**: sem autenticação com senha — nome do usuário fica em `localStorage` do
  navegador, pedido uma vez num overlay na home.
- **Branches**: `main` é o laboratório de estudo (sem preocupação de produção); `prod` adapta a
  mesma arquitetura de mídia (LiveKit self-hosted) para uso real com amigos numa VPS própria
  (perfil `vps`, TLS via nginx + Let's Encrypt, LiveKit exposto em subdomínio público). O
  princípio de minimalismo (I) vale nos dois branches; `prod` pode divergir em detalhes
  operacionais de deploy sem violar os princípios de arquitetura de mídia (III).

## Fluxo de Desenvolvimento

- Antes de implementar um conceito novo de WebRTC/tempo real, documentar o entendimento em
  `docs/conceito/` com referências (ex.: *WebRTC for the Curious*, guias oficiais do Spring,
  artigos da Baeldung).
- Mudanças de estrutura ou arquitetura são refletidas em `docs/projeto/` (`arquitetura.md`,
  `backend.md`, `frontend.md`) na mesma mudança que as implementa, não depois.
- Testes cobrem lógica de negócio (services, validação, controllers — ver `src/test/java`); TDD
  estrito não é exigido dado o caráter exploratório do projeto, mas todo service ou controller
  com regra de negócio não trivial DEVE ganhar teste antes de ser considerado concluído.
- Antes de assumir que uma mudança de comportamento observada é uma regressão introduzida por
  uma edição própria, verificar o histórico do git (`git log`/`git show`) — comportamento
  aparentemente estranho (ex.: câmera desligada por padrão) pode ser uma decisão intencional já
  registrada, não um bug.

## Governance

Esta constituição prevalece sobre convenções não escritas e sobre preferência pessoal pontual.
Se o código existente divergir de um princípio aqui registrado, a divergência DEVE ser resolvida
explicitamente — atualizando o princípio (se o código estiver certo e o princípio desatualizado)
ou o código (se o princípio estiver certo) — nunca deixando os dois divergentes silenciosamente.

**Emendas**: qualquer mudança a este documento requer descrever a mudança e sua motivação,
incrementar a versão conforme a política de SemVer abaixo, e atualizar a data de "Last Amended".

**Versionamento semântico**:
- MAJOR: remoção ou redefinição incompatível de um princípio existente.
- MINOR: novo princípio ou seção adicionada, ou orientação existente expandida de forma
  material.
- PATCH: clarificação, correção de texto ou refinamento não-semântico.

**Revisão de conformidade**: ao concluir cada fase de estudo descrita no README (ex.: ao
implementar persistência poliglota, CRUD de salas), revisitar se os princípios ainda refletem a
prática do projeto — atualizar este documento em vez de deixá-lo defasado.

**Version**: 1.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
