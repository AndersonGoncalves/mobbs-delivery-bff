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
