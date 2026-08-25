# Feature Specification: Modal de escolha de ícone no CRUD de salas

**Feature Branch**: `001-room-icon-picker`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "no crud de salas, no front quero ter uma modal para escolher o icone"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Escolher ícone ao criar uma sala (Priority: P1)

Ao criar uma nova sala, quem está preenchendo o formulário quer escolher o ícone clicando em
opções visuais, em vez de precisar digitar/colar um caractere de emoji manualmente.

**Why this priority**: É o caminho mais comum de uso do formulário de sala (criar é mais
frequente que editar) e é o ponto onde a fricção atual (digitar um emoji "de cabeça") mais
incomoda; sem isso a funcionalidade não entrega valor nenhum.

**Independent Test**: Abrir "Nova sala", acionar a seleção de ícone, escolher uma opção na
modal, confirmar que o campo de ícone do formulário reflete a opção escolhida, e enviar o
formulário com sucesso criando a sala com aquele ícone.

**Acceptance Scenarios**:

1. **Given** o formulário de "Nova sala" está aberto, **When** a pessoa aciona a seleção de
   ícone, **Then** uma modal se abre mostrando um conjunto de ícones pré-definidos para escolha.
2. **Given** a modal de ícones está aberta, **When** a pessoa clica em um ícone da lista,
   **Then** a modal fecha e o ícone escolhido passa a ser o valor selecionado no formulário de
   sala.
3. **Given** um ícone foi escolhido no formulário de "Nova sala", **When** a pessoa envia o
   formulário, **Then** a sala é criada com o ícone escolhido, do mesmo jeito que já acontece
   hoje com o campo de texto.

---

### User Story 2 - Trocar o ícone de uma sala existente (Priority: P2)

Ao editar uma sala já existente, quem está editando quer abrir a mesma modal de escolha e ver
qual ícone está selecionado atualmente, podendo trocar por outro da lista.

**Why this priority**: Reaproveita o mesmo formulário/modal da User Story 1 (o admin de salas já
usa um único modal para criar e editar), então o esforço incremental é pequeno, mas o valor só
se completa depois que a escolha na criação já funciona.

**Independent Test**: Abrir a edição de uma sala existente, abrir a seleção de ícone, confirmar
que o ícone atual da sala aparece indicado/destacado na modal, escolher um ícone diferente,
salvar, e confirmar que a sala passa a exibir o novo ícone (ex.: na barra lateral e no cabeçalho
da sala).

**Acceptance Scenarios**:

1. **Given** a modal de edição de uma sala existente foi aberta, **When** a pessoa aciona a
   seleção de ícone, **Then** a modal de ícones abre com o ícone atual da sala já indicado como
   selecionado (quando esse ícone estiver entre as opções pré-definidas).
2. **Given** a modal de ícones foi aberta durante uma edição, **When** a pessoa escolhe um ícone
   diferente do atual e salva o formulário, **Then** a sala passa a usar o novo ícone em todo
   lugar que hoje já exibe `Room.icon` (barra lateral, cabeçalho do canal).

---

### User Story 3 - Cancelar a escolha sem perder o ícone atual (Priority: P3)

Quem abriu a modal de ícones por engano, ou desistiu de trocar, quer poder fechá-la sem que isso
altere o ícone já selecionado no formulário.

**Why this priority**: É uma garantia de não-regressão/usabilidade sobre as duas histórias
anteriores, não uma capacidade nova por si só — por isso a prioridade mais baixa.

**Independent Test**: Abrir a modal de ícones (na criação ou na edição), fechar sem clicar em
nenhuma opção (ex.: botão cancelar/fechar, tecla Esc), e confirmar que o ícone previamente
selecionado no formulário continua o mesmo.

**Acceptance Scenarios**:

1. **Given** a modal de ícones está aberta e um ícone já estava selecionado no formulário,
   **When** a pessoa fecha a modal sem escolher outra opção, **Then** o ícone selecionado no
   formulário permanece o que estava antes de abrir a modal.

---

### Edge Cases

- O que acontece ao editar uma sala cujo ícone atual (salvo antes desta funcionalidade existir,
  ou digitado livremente) não está entre as opções pré-definidas da modal? O ícone atual da sala
  deve continuar sendo exibido/preservado como selecionado, mesmo sem corresponder a nenhuma
  opção da grade.
- O que acontece se a pessoa tentar enviar o formulário de sala sem nenhum ícone selecionado? O
  envio deve continuar bloqueado/inválido, igual ao comportamento atual do campo obrigatório.
- Como a grade de ícones se comporta em telas estreitas? As opções devem continuar visíveis e
  clicáveis, se necessário quebrando em mais linhas (sem exigir rolagem horizontal).
- Duas salas diferentes podem usar o mesmo ícone? Sim — não existe hoje, e esta funcionalidade
  não introduz, nenhuma restrição de unicidade sobre o ícone da sala.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O formulário de criação/edição de sala DEVE oferecer uma forma de abrir uma modal
  dedicada de seleção de ícone, em vez de exigir que a pessoa digite o caractere do ícone
  manualmente.
- **FR-002**: A modal de seleção de ícone DEVE exibir um conjunto de opções de ícone
  pré-definidas, apresentadas de forma que cada uma possa ser escolhida com um único clique/toque.
- **FR-003**: Ao escolher uma opção na modal de ícones, o sistema DEVE aplicar esse ícone como o
  valor selecionado no formulário de sala (criação ou edição) e fechar a modal de ícones.
- **FR-004**: O formulário de sala DEVE mostrar visualmente qual ícone está selecionado no
  momento, antes do envio do formulário.
- **FR-005**: Ao editar uma sala existente, a modal de ícones DEVE indicar como selecionado o
  ícone atual da sala, quando esse ícone pertencer ao conjunto de opções pré-definidas.
- **FR-006**: Quando o ícone atual de uma sala (em edição) não pertencer ao conjunto de opções
  pré-definidas, o sistema DEVE preservar esse ícone como o valor selecionado no formulário em
  vez de forçar a troca por uma das opções da modal.
- **FR-007**: O formulário de sala DEVE continuar exigindo um ícone selecionado antes de permitir
  o envio (criação ou edição), preservando a validação já existente.
- **FR-008**: Fechar/cancelar a modal de ícones sem escolher uma opção NÃO DEVE alterar o ícone
  que já estava selecionado no formulário.
- **FR-009**: A modal de seleção de ícone DEVE poder ser fechada por teclado (tecla Esc),
  consistente com o comportamento das demais modais já existentes na aplicação.
- **FR-010**: A criação e a edição de sala DEVEM continuar usando os mesmos endpoints e o mesmo
  formato de dados de hoje (`POST /api/rooms`, `PUT /api/rooms/{id}`, campo `icon` como texto) —
  esta funcionalidade é uma mudança de interface, não uma mudança de contrato de API.

### Key Entities *(include if feature involves data)*

- **Room (existente)**: continua com o atributo `icon` (texto livre, hoje até 32 caracteres,
  sem exigência de formato específico) — esta funcionalidade não adiciona nem remove atributos
  do dado persistido, apenas muda como a pessoa usuária preenche esse atributo na interface.
- **Catálogo de ícones**: lista de opções pré-definidas apresentada na modal de seleção. É um
  conceito de apresentação (client-side), não uma entidade persistida — seu conteúdo exato
  (quais ícones, quantos, agrupamento) é um detalhe de implementação a ser definido no
  planejamento, não fixado por esta especificação.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quem cria ou edita uma sala consegue definir o ícone sem digitar nenhum caractere,
  completando a escolha com um único clique dentro da modal de ícones.
- **SC-002**: 100% das salas criadas ou editadas pelo formulário continuam sendo salvas com um
  ícone válido preenchido — nenhuma sala é salva sem ícone.
- **SC-003**: Salas que já existiam antes desta funcionalidade, incluindo as com ícone digitado
  livremente fora do conjunto pré-definido, continuam exibindo o ícone corretamente depois da
  mudança, sem perda ou quebra visual.
- **SC-004**: Cancelar a modal de ícones sem escolher uma opção nunca altera o ícone que já
  estava selecionado, em 100% das tentativas.

## Assumptions

- O conjunto de ícones pré-definidos é uma lista curta e curada de emojis (dezenas, não
  centenas), escolhida durante a implementação — não um seletor de emoji genérico do sistema
  operacional/navegador nem uma biblioteca externa de emoji picker, para manter a coerência com
  o princípio de minimalismo/sem dependência desnecessária do projeto.
- A modal substitui a digitação manual como fluxo principal de escolha de ícone, mas o ícone
  salvo continua sendo apenas texto livre no banco (sem migração de dados nem restrição nova de
  formato) — por isso ícones antigos fora do catálogo continuam válidos (ver FR-006).
- Não há exigência de unicidade de ícone entre salas: mais de uma sala pode usar o mesmo ícone,
  igual ao comportamento atual.
- Esta funcionalidade é somente de interface (frontend); nenhuma mudança é necessária nos
  endpoints `POST /api/rooms` / `PUT /api/rooms/{id}` nem na validação de backend do campo
  `icon`, já que ela aceita qualquer texto de até 32 caracteres.
