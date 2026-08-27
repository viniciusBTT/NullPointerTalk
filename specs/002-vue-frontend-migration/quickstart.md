# Quickstart: validando a migração para Vue.js

## Pré-requisitos

- Node.js LTS (versão fixada em `frontend/package.json`/`pom.xml`, ver research.md #1) instalado
  localmente para desenvolvimento (não é exigido para rodar o `.jar` já buildado).
- Mesmo pré-requisito de hoje para o backend: Java 21, Docker (Postgres, MongoDB, LiveKit).

## Ambiente de desenvolvimento (dois processos, hot-reload)

```bash
docker compose up -d postgres mongo livekit   # igual a hoje
./mvnw spring-boot:run                        # backend em :8080

# num segundo terminal:
cd frontend
npm install
npm run dev                                    # Vite em :5173, com proxy de /api, /ws e /room/*/token para :8080
```

Abra `http://localhost:5173` (não `:8080`) durante o desenvolvimento — é o Vite quem serve a UI
com hot-reload; ele repassa as chamadas de API/WebSocket para o backend.

**Validação de SC-002 (hot-reload)**: altere um texto visível em qualquer componente de
`frontend/src/components/` e salve; a mudança deve aparecer no navegador em menos de 2 segundos,
sem recarregar a página manualmente.

## Build de produção (origem única)

```bash
./mvnw clean package   # dispara npm ci + npm run build (frontend-maven-plugin) e empacota o resultado no jar
java -jar target/backend-0.0.1-SNAPSHOT.jar
```

**Validação de SC-004 (origem única)**: com o jar rodando, `http://localhost:8080` deve servir a
aplicação completa — nenhuma chamada de rede deve sair para `localhost:5173` ou qualquer outra
origem; inspecionar a aba Network do navegador confirma isso.

**Validação do edge case "build quebrado não sobe"**: introduza um erro de sintaxe em qualquer
arquivo `.vue`/`.ts` de `frontend/src` e rode `./mvnw clean package` — o build deve falhar antes
de gerar o jar (não deve ser possível empacotar/rodar uma versão parcial).

## Desempenho de carregamento (SC-003)

Compare o tempo até a interface ficar interativa (Time to Interactive) entre a versão atual
(antes da migração) e a versão migrada, sob condições de rede equivalentes:

1. Antes de trocar para a versão migrada, com a versão atual (Thymeleaf/JS puro) rodando, abra
   uma aba anônima, use o DevTools → Performance (ou Lighthouse) com o mesmo perfil de rede
   (ex.: "Fast 3G" ou "No throttling") e registre o tempo até interativo (TTI).
2. Repita a mesma medição na versão migrada, com o jar de produção rodando
   (`http://localhost:8080`), sob o mesmo perfil de rede usado no passo 1.
3. Compare os dois valores — o TTI da versão migrada não deve ser maior que o da versão atual.

## Paridade funcional (SC-001) — roteiro manual

Repita este roteiro em duas abas/navegadores diferentes (uma normal + uma anônima, para
`localStorage` separado), comparando com o comportamento hoje documentado no
[`README.md`](../../README.md):

1. Abrir a aplicação pela primeira vez → overlay pedindo nome aparece; definir nomes diferentes
   em cada aba.
2. Entrar na mesma sala em ambas as abas → presença mostra as duas pessoas.
3. Enviar mensagens de chat de uma aba → aparecem na outra; recarregar a página e confirmar que o
   histórico persiste (via MongoDB, sem alteração de contrato).
4. Ligar câmera/microfone em uma aba → o vídeo/áudio aparece na outra via LiveKit; desligar e
   confirmar que os badges de mic/câmera desligados refletem o estado.
5. Compartilhar tela → a outra aba vê a troca de mídia sem interrupção perceptível.
6. Como administrador, criar uma nova sala, editar seu ícone/nome e excluí-la → sidebar de ambas
   as abas reflete as mudanças em tempo real (via `/topic/room-catalog`), sem reload.
7. Acessar diretamente `http://localhost:8080/room/<id-de-sala-existente>` → cai direto na sala
   correta (deep link). Acessar `http://localhost:8080/room/<id-inexistente>` → cai na tela
   inicial sem erro visível (redirecionamento client-side, ver research.md #2).
8. Fechar e reabrir a aba (mesmo `localStorage`) → nome e preferências de mic/câmera continuam os
   mesmos definidos antes (SC-005).

Se todos os passos acima se comportarem como descrito, a migração satisfaz SC-001 e SC-005.

## Testes automatizados (stores/composables não triviais)

```bash
cd frontend
npm run test:unit   # Vitest — stores Pinia e composables (ver research.md #5)
```
