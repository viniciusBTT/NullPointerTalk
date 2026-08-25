# Quickstart: validar a modal de escolha de ícone

Guia de validação manual — este projeto não tem harness de teste automatizado de frontend (ver
`plan.md`, Technical Context). Cobre as 3 user stories de [spec.md](./spec.md).

## Pré-requisitos

```bash
docker compose up -d postgres mongo livekit   # Postgres, MongoDB e o servidor de mídia
./mvnw spring-boot:run                        # sobe em :8080
```

Abra `http://localhost:8080` no navegador. `RoomSeeder` garante as salas padrão (`estudos`,
`jogos`) na primeira subida, então já existe pelo menos uma sala para testar a edição.

## Cenário 1 — Escolher ícone ao criar uma sala (User Story 1, P1)

1. Clique no botão de adicionar sala (`btn-add-room`) na barra lateral.
2. No formulário "Nova sala", acione a seleção de ícone (em vez de digitar no campo de ícone).
3. **Esperado**: uma modal abre mostrando uma grade de ícones pré-definidos, cada um clicável
   com um único toque.
4. Clique em um ícone da grade.
5. **Esperado**: a modal de ícones fecha, e o formulário de sala passa a mostrar aquele ícone
   como selecionado (preview visível antes de enviar — FR-004).
6. Preencha identificador e nome, envie o formulário.
7. **Esperado**: a sala é criada; o ícone escolhido aparece na barra lateral e no cabeçalho ao
   entrar na sala (mesmo caminho de dados de hoje: `RoomCatalogEvent` via `/topic/room-catalog`).

## Cenário 2 — Trocar o ícone de uma sala existente (User Story 2, P2)

1. Na barra lateral, acione editar em uma sala já existente (ex.: `estudos`).
2. Acione a seleção de ícone.
3. **Esperado**: a modal abre com o ícone atual da sala já indicado/destacado na grade, se ele
   pertencer ao catálogo pré-definido.
4. Escolha um ícone diferente e salve o formulário.
5. **Esperado**: a sala passa a exibir o novo ícone em todo lugar que já mostra `Room.icon`
   (barra lateral, cabeçalho do canal ativo).

### 2b — Ícone legado fora do catálogo (Edge Case / FR-006)

1. Via API diretamente (ou editando o banco), garanta que uma sala tenha um `icon` fora do
   catálogo pré-definido, por exemplo:
   ```bash
   curl -X PUT http://localhost:8080/api/rooms/estudos \
     -H 'Content-Type: application/json' \
     -d '{"name":"Estudos","icon":"🦄"}'
   ```
2. Abra a edição dessa sala e acione a seleção de ícone.
3. **Esperado**: nenhuma opção da grade aparece marcada como selecionada, mas o formulário
   continua mostrando `🦄` como o ícone atual (preview) até que a pessoa escolha outra opção.
4. Feche a modal sem escolher nada.
5. **Esperado**: o ícone da sala continua `🦄` (nada foi enviado nem alterado).

## Cenário 3 — Cancelar a escolha sem perder o ícone atual (User Story 3, P3)

1. Abra "Nova sala" ou a edição de uma sala existente e acione a seleção de ícone.
2. Feche a modal de ícones sem clicar em nenhuma opção — teste os três caminhos:
   - botão de cancelar/fechar da modal;
   - clique fora da modal (no backdrop);
   - tecla **Esc**.
3. **Esperado**, nos três casos: o ícone que já estava selecionado no formulário (vazio, no caso
   de "Nova sala"; o atual, no caso de edição) permanece o mesmo — a modal de ícones não altera
   nada ao ser apenas fechada (FR-008, FR-009).

## Cenário 4 — Validação obrigatória (FR-007)

1. Abra "Nova sala", preencha identificador e nome, mas não escolha nenhum ícone.
2. Tente enviar o formulário.
3. **Esperado**: o envio continua bloqueado/inválido, igual ao comportamento atual do campo
   `icon` obrigatório — nenhuma sala é criada sem ícone.

## Cenário 5 — Grade em tela estreita (Edge Case)

1. Reduza a largura da janela do navegador (ou emule um viewport de celular nas DevTools).
2. Abra a modal de seleção de ícone.
3. **Esperado**: as opções continuam todas visíveis e clicáveis, quebrando em mais linhas — sem
   rolagem horizontal e sem ícones cortados/inacessíveis.

## Fora de escopo desta validação

- Nenhuma chamada a `/api/rooms` muda de formato — não há novo contrato para testar além do que
  `RoomTokenControllerValidationTest` já cobre no backend.
- Não há verificação de unicidade de ícone entre salas (não é um requisito desta feature).
