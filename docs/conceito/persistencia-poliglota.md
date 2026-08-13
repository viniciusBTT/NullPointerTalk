# Persistência poliglota: Postgres + MongoDB

## O que é

Usar bancos de dados diferentes no mesmo sistema, cada um para o tipo de dado que ele resolve melhor, em vez de forçar tudo num único banco.

## Por que dois bancos neste projeto

- **Postgres (relacional)** — `Room` e `Participant`: dados com relacionamento claro (uma sala tem vários participantes, um participante pertence a uma sala), estrutura fixa, e onde integridade referencial (chaves estrangeiras, constraints) faz sentido.
- **MongoDB (documento)** — `ChatMessage`: histórico de mensagens é essencialmente uma lista de eventos append-only, sem relacionamento forte entre si, onde o formato do documento pode evoluir com o tempo (ex: adicionar um campo de "reações" numa mensagem) sem precisar de migração de schema.

## Trade-offs de estudar isso junto

| | Postgres (JPA) | MongoDB |
|---|---|---|
| Modelo | Tabelas, linhas, relacionamentos | Documentos (JSON-like), coleções |
| Schema | Fixo, migrado via DDL | Flexível, por documento |
| Consistência | Transações ACID nativas | Consistência por documento; transações multi-documento existem mas são mais raras de usar |
| Quando usar | Dados estruturados, com relações, que exigem integridade forte | Dados semi-estruturados, alto volume de escrita, schema evolutivo |

Ter os dois no mesmo projeto é uma forma prática de sentir na mão quando cada modelo "encaixa melhor" — ao invés de forçar o chat inteiro em tabelas relacionais (JOINs desnecessários para simplesmente listar mensagens em ordem) ou forçar dados de sala/participante em documentos (perdendo integridade referencial fácil).

## Como aparece no código

- `spring-boot-starter-data-jpa` + `org.postgresql:postgresql` → entidades `Room`/`Participant`, repositórios `JpaRepository`.
- `spring-boot-starter-data-mongodb` → documento `ChatMessage`, repositório `MongoRepository`.
- Ambos configurados em `src/main/resources/application.properties` (`spring.datasource.*` para Postgres, `spring.data.mongodb.uri` para Mongo).
- Sobem localmente via `docker-compose.yml` na raiz do projeto.

## Referências

- Documentação do Spring Data JPA (`spring.io/projects/spring-data-jpa`) — repositórios, `@Entity`, relacionamentos.
- Documentação do Spring Data MongoDB (`spring.io/projects/spring-data-mongodb`) — `@Document`, `MongoRepository`.
- Documentação oficial do MongoDB — seção "quando usar MongoDB vs um banco relacional".
