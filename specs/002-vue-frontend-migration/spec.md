# Feature Specification: Migração do Frontend para Vue.js

**Feature Branch**: `002-vue-frontend-migration`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Migrar o front-end atual (Thymeleaf + JavaScript puro) para Vue.js + TypeScript + Pinia + Vite + Tailwind CSS, mantendo a estrutura de mono repo (backend Spring Boot e frontend no mesmo repositório Git, backend continua servindo os artefatos buildados do frontend na mesma origem em runtime)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paridade funcional para o usuário final (Priority: P1)

Como usuário final da sala de chat/videochamada, ao acessar a aplicação após a migração, eu
continuo conseguindo definir meu nome, entrar na sala, ver quem está presente, trocar mensagens
de chat, ligar/desligar câmera e microfone, compartilhar tela e escolher o ícone da sala —
exatamente como consigo fazer hoje — sem perceber nenhuma diferença de comportamento.

**Why this priority**: é o requisito inegociável de qualquer migração de frontend: se o usuário
final perceber qualquer funcionalidade quebrada ou diferente, a migração falhou, independente de
quão melhor o código interno tenha ficado.

**Independent Test**: pode ser testado percorrendo manualmente cada fluxo hoje existente
(overlay de nome, entrar em sala, chat persistente, presença, áudio/vídeo/tela via LiveKit,
seleção de ícone de sala, administração de sala) na versão migrada e comparando com o
comportamento atual, sem depender de nenhuma outra user story.

**Acceptance Scenarios**:

1. **Given** um usuário que nunca acessou a aplicação, **When** ele abre a URL da sala pela
   primeira vez, **Then** vê o mesmo overlay pedindo seu nome, e o nome informado é salvo da
   mesma forma que hoje (localStorage do navegador).
2. **Given** um usuário já dentro de uma sala, **When** ele envia uma mensagem de chat, **Then**
   a mensagem aparece para todos os participantes presentes e continua disponível ao recarregar
   a página (histórico persistido), igual ao comportamento atual.
3. **Given** um usuário com câmera/microfone ligados, **When** ele compartilha a tela, **Then**
   os demais participantes veem a troca de mídia sem interrupção perceptível, da mesma forma que
   hoje.
4. **Given** um usuário administrando uma sala, **When** ele abre o seletor de ícone da sala e
   escolhe um novo ícone, **Then** o ícone é atualizado e refletido para os demais participantes,
   igual ao comportamento atual.

---

### User Story 2 - Ciclo de desenvolvimento mais rápido para quem mantém o projeto (Priority: P2)

Como mantenedor do projeto, ao alterar uma tela ou componente da interface, eu vejo o resultado
atualizado no navegador quase instantaneamente, sem precisar recarregar a página manualmente
inteira como preciso fazer hoje com o JavaScript puro.

**Why this priority**: é o principal ganho prático da migração (produtividade de quem mantém o
laboratório de estudo), mas depende da User Story 1 já estar resolvida — não adianta um ciclo de
desenvolvimento rápido sobre uma aplicação que não replica o comportamento atual.

**Independent Test**: pode ser testado alterando o texto ou estilo de um componente existente em
ambiente de desenvolvimento local e observando o tempo entre salvar o arquivo e ver a mudança
refletida no navegador.

**Acceptance Scenarios**:

1. **Given** o ambiente de desenvolvimento local rodando, **When** o mantenedor salva uma
   alteração em um componente de tela, **Then** o navegador reflete a mudança automaticamente,
   sem exigir um refresh manual completo da página nem perda do estado de navegação corrente.

---

### User Story 3 - Estado de UI centralizado e reutilizável (Priority: P3)

Como mantenedor do projeto, ao precisar alterar como a sessão de chat, a presença de
participantes ou o estado de áudio/vídeo são compartilhados entre diferentes partes da tela, eu
faço essa alteração em um único lugar de estado centralizado, em vez de rastrear manipulação
manual de DOM espalhada por múltiplos arquivos JavaScript como hoje.

**Why this priority**: é um ganho de manutenibilidade de longo prazo, mas não bloqueia a entrega
da migração em si — as duas primeiras user stories já entregam uma aplicação funcional e mais
produtiva de se editar.

**Independent Test**: pode ser testado inspecionando o código de uma funcionalidade existente
(ex.: presença de participantes) e verificando que seu estado é lido e alterado a partir de um
único módulo de estado centralizado, consumido por todos os componentes que precisam dele.

**Acceptance Scenarios**:

1. **Given** duas partes distintas da tela que exibem informação derivada da mesma sessão de
   chat (ex.: contador de mensagens não lidas e lista de mensagens), **When** uma nova mensagem
   chega, **Then** ambas as partes da tela atualizam a partir da mesma fonte de estado, sem
   lógica de sincronização duplicada entre elas.

---

### Edge Cases

- O que acontece se o build de produção do frontend falhar? A aplicação NÃO deve subir com uma
  versão parcial ou quebrada — o processo de build/deploy deve falhar de forma visível antes de
  servir tráfego.
- Como o sistema lida com um usuário que mantém a aba aberta na versão antiga durante a janela de
  deploy da versão migrada? Ao recarregar a página, ele deve retomar a sessão normalmente, pois
  chat, presença e estado de sala são persistidos no backend (MongoDB/PostgreSQL), não apenas no
  frontend.
- O que acontece com preferências já salvas no navegador do usuário (nome, preferências de
  áudio/vídeo) antes da migração? Continuam sendo lidas e respeitadas após a migração, sem exigir
  reconfiguração pelo usuário.
- O que acontece se o navegador do usuário não suportar algum recurso exigido pela nova stack de
  frontend? Deve receber uma mensagem de erro compreensível, em vez de uma tela em branco ou
  travada silenciosamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O frontend DEVE ser reescrito com Vue.js 3 (Composition API) e TypeScript,
  substituindo os módulos de JavaScript puro hoje existentes em `src/main/resources/static/js`.
- **FR-002**: O estado compartilhado entre componentes de tela (sessão de chat, presença de
  participantes, estado de áudio/vídeo/tela, identidade do usuário) DEVE ser gerenciado via
  Pinia como fonte única de verdade, substituindo os módulos de estado manuais atuais
  (`chat-store.js`, `presence.js`, `voice-session.js`, etc.).
- **FR-003**: O build do frontend DEVE ser feito com Vite, gerando artefatos estáticos
  otimizados para produção.
- **FR-004**: A estilização das telas DEVE usar Tailwind CSS, substituindo as folhas de estilo
  CSS manuais hoje existentes (`base.css`, `chat.css`, `overlays.css`, `shell.css`,
  `stage.css`, `tokens.css`).
- **FR-005**: Em produção, o Spring Boot DEVE continuar servindo os artefatos finais do build do
  frontend a partir da mesma origem em runtime — sem CORS multi-origem e sem um segundo
  processo/serviço implantado separadamente para servir o frontend.
- **FR-006**: Todas as funcionalidades hoje existentes no frontend — identidade do usuário via
  `localStorage`, overlay de definição de nome, presença de participantes, chat persistente via
  STOMP/WebSocket, áudio/vídeo/compartilhamento de tela via LiveKit, seletor de ícone de sala e
  administração de sala — DEVEM continuar funcionando sem regressão perceptível ao usuário final
  após a migração.
- **FR-007**: O sistema DEVE continuar funcionando sem autenticação por senha, mantendo a
  identidade do usuário em `localStorage` conforme já decidido para o projeto.
- **FR-008**: O ambiente de desenvolvimento local DEVE oferecer recarregamento automático rápido
  ao editar um componente ou tela, sem exigir rebuild manual completo a cada alteração.
- **FR-009**: A decisão e a nova estrutura de pastas do frontend dentro do mono repo DEVEM ser
  documentadas em `docs/projeto/frontend.md` como parte da mesma mudança que implementa a
  migração.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Todos os fluxos de usuário hoje existentes (definir nome, entrar em sala, chat,
  presença, áudio/vídeo, compartilhamento de tela, seleção de ícone de sala, administração de
  sala) funcionam sem diferença perceptível para o usuário final após a migração, validados
  manualmente contra o comportamento da versão atual.
- **SC-002**: Uma alteração simples em uma tela (ex.: texto ou estilo) leva menos de 2 segundos
  entre salvar o arquivo e a mudança aparecer atualizada no navegador em ambiente de
  desenvolvimento local — hoje esse ciclo exige um recarregamento manual completo da página.
- **SC-003**: O tempo até a interface ficar interativa para o usuário, a partir do carregamento
  inicial da página, não piora em relação à versão atual, medido em condições de rede
  equivalentes.
- **SC-004**: A aplicação migrada continua acessível a partir de uma única URL/origem em
  produção, sem exigir configuração adicional de múltiplos domínios para funcionar.
- **SC-005**: 100% das preferências do usuário salvas antes da migração (nome, preferências de
  áudio/vídeo) continuam válidas depois da migração, sem exigir que o usuário reconfigure nada.

## Assumptions

- O backend Spring Boot, seus endpoints REST/WebSocket (STOMP) e o serviço de emissão de tokens
  do LiveKit permanecem praticamente inalterados por esta migração — apenas a camada de frontend
  é substituída. A única exceção necessária é a adição de um endpoint de listagem
  (`GET /api/rooms`), hoje inexistente por design porque a lista de salas era embutida
  diretamente no HTML renderizado pelo servidor; como o shell deixa de ser renderizado no
  servidor, a SPA precisa buscar esse mesmo catálogo por uma chamada de API.
- As decisões já registradas na constituição do projeto (identidade sem senha via `localStorage`,
  mídia sempre via LiveKit self-hosted) permanecem válidas e não fazem parte do escopo desta
  migração.
- A migração substitui integralmente o frontend atual de uma vez (não há período prolongado de
  convivência entre a interface antiga em JavaScript puro e a nova em Vue.js); a definição exata
  da estrutura de pastas do novo frontend dentro do mono repo fica a cargo do plano técnico
  (`/speckit-plan`), não desta especificação.
- Os navegadores-alvo continuam sendo os mesmos hoje suportados (navegadores modernos com suporte
  a ES2020+ e WebRTC), sem necessidade de suporte a navegadores legados.
- Esta migração cobre a interface web já existente (o shell servido hoje via Thymeleaf e os
  módulos JavaScript atuais); não introduz novas telas ou funcionalidades de produto além das já
  existentes.
