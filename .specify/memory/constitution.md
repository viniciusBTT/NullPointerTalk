<!--
Sync Impact Report
- Version change: 1.1.0 → 2.0.0
- Modified principles:
  - II. Monólito de Origem Única (Sem Frontend Separado) → II. Mono Repo com Backend como
    Origem Única em Runtime — redefinição incompatível: revoga a proibição a um processo de
    build de frontend e a um framework de UI; passa a permitir Vue.js + TypeScript + Pinia +
    Vite + Tailwind CSS, desde que o build final continue servido pela mesma origem do Spring
    Boot em runtime (sem deploy/origem separados, sem CORS multi-origem em produção)
  - I. Minimalismo e Sem Dependência Desnecessária (YAGNI) — removida a menção a "sem SPA, sem
    build de frontend" como decisão de minimalismo já tomada, por não refletir mais o princípio
    II
- Added sections: none
- Removed sections: none
- Deferred placeholders: none
- Templates checked:
  - .specify/templates/plan-template.md — gate genérico "Constitution Check", sem texto
    específico de princípio para sincronizar, nenhuma edição necessária.
- Follow-up TODOs:
  - docs/projeto/frontend.md DEVE ser atualizado (Princípio IV) quando a migração para
    Vue.js + TS + Pinia + Vite + Tailwind for implementada, registrando a decisão e a nova
    estrutura de pastas do frontend dentro do mono repo.

Sync Impact Report (1.0.0 → 1.1.0)
- Version change: 1.0.0 → 1.1.0
- Modified principles: n/a
- Added sections:
  - Governance: novo item "Idioma de comunicação" (comunicação de assistentes/agentes de IA
    sobre o projeto DEVE ser sempre em pt-BR)
- Removed sections: none
- Deferred placeholders: none
- Templates checked:
  - .specify/templates/plan-template.md — has a generic "Constitution Check" gate; no
    principle-specific text to sync, no edit needed (out of scope for this command regardless).
- Follow-up TODOs: none

Sync Impact Report (1.0.0, initial ratification)
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
-->

# NullPointerTalk Constitution

## Core Principles

### I. Minimalismo e Sem Dependência Desnecessária (YAGNI)

Toda dependência, biblioteca ou camada de abstração adicionada DEVE resolver uma necessidade
real da fase de estudo atual — nunca uma necessidade hipotética futura. Prefira a solução mais
simples que funcione a um framework ou camada extra "por precaução". Decisões de minimalismo já
tomadas (sem autenticação com senha) só devem ser revertidas
quando a fase de estudo em curso exigir isso de fato, não por antecipação.

Rationale: o objetivo do projeto é aprender comunicação em tempo real na web, não maximizar
arquitetura; complexidade não essencial desvia foco do aprendizado e aumenta o custo de manter
o laboratório rodando.

### II. Mono Repo com Backend como Origem Única em Runtime

O projeto É um único repositório Git (mono repo): backend e frontend convivem no mesmo
repositório, sem divisão em repositórios separados. Em runtime, o Spring Boot continua sendo a
única origem servida — os artefatos finais do build do frontend (Vue.js + TypeScript + Pinia +
Vite + Tailwind CSS) são gerados e servidos a partir do próprio backend, nunca implantados como
aplicação separada com origem/deploy independente. Não introduzir configuração de CORS
multi-origem em produção para contornar essa fronteira. É permitido um processo de build de
frontend (Vite) e um framework de UI (Vue) com gerenciamento de estado (Pinia) — a proibição
anterior a esse tipo de ferramenta fica revogada por esta emenda; o que continua não-negociável
é a origem única em runtime, não a ausência de um passo de build.

Rationale: um build de frontend moderno (Vue + TS + Pinia + Vite + Tailwind) passou a ser
necessário para sustentar a complexidade de estado e UI do projeto, mas isso não precisa (nem
deve) reabrir a classe de problemas que a decisão original evitava — build duplo em produção,
CORS, dessincronia de versões entre serviços implantados separadamente. Manter tudo em um mono
repo com origem única preserva o app trivial de rodar localmente e implantar
(`./mvnw spring-boot:run` continua servindo o frontend buildado).

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

- **Backend**: Java 21, Spring Boot (Maven), módulo na raiz do repositório (mono repo).
- **Frontend**: Vue.js 3 + TypeScript + Pinia (estado) + Vite (build) + Tailwind CSS; buildado
  e servido a partir do mesmo backend Spring Boot (mono repo, origem única em runtime — ver
  Princípio II).
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

**Idioma de comunicação**: toda comunicação de assistentes/agentes de IA (ex.: Claude Code)
relacionada a este projeto — respostas de chat, mensagens de commit geradas por IA, documentação
de decisões (`docs/projeto/`, `docs/conceito/`) e artefatos do Spec Kit (spec, plan, tasks,
clarify, checklists etc.) — DEVE ser sempre em português brasileiro (pt-BR), independentemente
do idioma em que o pedido do usuário for escrito.

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

**Version**: 2.0.0 | **Ratified**: 2026-08-25 | **Last Amended**: 2026-08-25
