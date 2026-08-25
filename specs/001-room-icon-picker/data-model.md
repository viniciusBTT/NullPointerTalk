# Phase 1 Data Model: Modal de escolha de ícone no CRUD de salas

Esta funcionalidade não introduz nenhuma entidade persistida nova, nem migração de banco. Os
dois conceitos abaixo bastam para descrever o que muda.

## Room (existente, inalterado)

Fonte: `src/main/java/com/nullpointertalk/room/Room.java`.

| Campo | Tipo | Regra | Muda nesta feature? |
|-------|------|-------|----------------------|
| `id` | `String` (PK, ≤32) | slug, `^[a-z0-9-]{1,32}$` na criação | Não |
| `name` | `String` (≤60) | obrigatório | Não |
| `icon` | `String` (≤32) | obrigatório, texto livre — sem formato imposto | Não — continua texto livre; a modal só muda *como* esse texto é escolhido na UI, não o que é aceito/persistido |
| `createdAt` | `Instant` | imutável | Não |

`RoomCreateRequest`/`RoomUpdateRequest` (validação de entrada) também não mudam: `icon`
continua `@NotBlank @Size(max = 32)`, sem novo `@Pattern`. Um ícone digitado livremente antes
desta feature (ou colado fora do catálogo curado) permanece um valor válido e persistível — é
exatamente o caso coberto por FR-006.

## Catálogo de ícones (novo, somente client-side — não persistido)

Lista estática de opções apresentadas na modal de seleção. Não é uma tabela nem chega a ter uma
"entidade" no sentido de dado de negócio — é conteúdo de apresentação, definido no JS do
frontend (ver [research.md](./research.md), Decisão 2).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `glyph` | `string` | O caractere emoji exibido no botão e gravado em `Room.icon` quando escolhido |
| `label` | `string` | Nome curto do ícone, usado só como `title`/acessibilidade do botão (não é persistido) |

Exemplo de shape (o conteúdo exato — quais/quantos emojis — é decidido na implementação, não
fixado pela especificação):

```js
export const ROOM_ICON_CATALOG = [
  { glyph: '💬', label: 'Conversa' },
  { glyph: '🎮', label: 'Jogos' },
  { glyph: '📚', label: 'Estudos' },
  // ...
];
```

Não há relação de chave estrangeira nem de unicidade entre `ROOM_ICON_CATALOG` e `Room.icon`:
um `Room.icon` pode ou não corresponder a um `glyph` do catálogo (ver FR-006), e o mesmo `glyph`
pode ser usado por várias salas (nenhuma restrição de unicidade é introduzida — ver spec
Assumptions).

## Sem transições de estado

Não há máquina de estados envolvida — a modal de ícone é um seletor efêmero de UI (aberta →
uma opção clicada → fechada, ou aberta → cancelada → fechada), sem estado que sobreviva além do
próprio `Room.icon` já existente no formulário.
