# mobbs-delivery-bff

BFF (Node.js + Restify + MongoDB/Mongoose) do ecossistema mobbs-delivery — consumido por
`mobbs-delivery-app` (Flutter) e `mobbs-delivery-web` (React).

## Comandos

- `npm run dev` — sobe em modo desenvolvimento (`ts-node-dev`, com reload automático).
- `npm run build` / `npm start` — build de produção (`tsc` + `node dist/main.js`).
- `npm run lint` — ESLint.
- `npm test` — Jest.
- `docker compose up` — sobe `api` + `mongo:7`; `docker compose -f docker-compose.yml -f docker-compose.debug.yml up` expõe o inspector do Node na porta 9229.

## Padrões

Ver `docs/architecture/patterns.md` §16 (BFF) e `docs/architecture/overview.md` no repositório
`mobbs-delivery-app` — este repositório ainda não tem `docs/`/`specs/` próprios (ver
`specs/README.md` daquele repo para o processo de SDD compartilhado entre os repositórios do
ecossistema).

## Pendências

- **Documentação da API (Swagger/OpenAPI)** — decidido em `docs/architecture/patterns.md` §16.7
  ("OpenAPI escrito à mão em `swagger.spec.ts`, servido em `/docs` via Swagger UI", mesmo esquema
  de `rotas-sz-bff`), **ainda não implementado**. Cobrir, quando for feito, todos os endpoints já
  ativos em `main.ts` (`restaurants`, `restaurant-operators`, `catalog`, `orders`,
  `raw-materials`) — necessário pra testar a API manualmente sem depender de um cliente HTTP
  escrito à mão (Postman/Insomnia/curl).
- **Sem rota pública de criação do primeiro `Restaurant`/`RestaurantOperator`** — todo endpoint de
  escrita de restaurante/operador já exige um operador autenticado (`restaurantOperatorMiddleware`),
  então o primeiro restaurante + primeiro operador de um ambiente novo precisam ser inseridos
  direto no MongoDB (sem endpoint HTTP para isso) antes de qualquer teste ponta a ponta contra
  rotas `/restaurants/me/...`.
