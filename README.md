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

## Scripts de terminal (`scripts/`)

Rodam direto contra o Mongo, sem subir o servidor HTTP — mesmo padrão em todos:
`npm run <nome> -- --flag=valor`. Uso detalhado (todos os parâmetros) no cabeçalho de cada
arquivo.

- `npm run seed:restaurant` — cria restaurante + operador de teste.
- `npm run seed:catalog` — popula cardápio de teste (categorias/produtos).
- `npm run seed:additional-group-templates` / `seed:additional-group-option-images` /
  `seed:highlights` — dados de teste complementares.
- `npm run reset:test-restaurant -- --slug=<slug>` (default `meu-restaurante`) —
  `specs/0040-reset-restaurante-teste`: apaga um restaurante de teste por completo (todo o
  catálogo/pedidos/financeiro/estoque que pertence só a ele) **e** a conta Firebase
  Authentication do(s) e-mail(is) de operador vinculados — pra poder recriar o mesmo restaurante
  com o mesmo slug e o mesmo e-mail de login numa rodada de teste seguinte, sem esbarrar em
  "slug já existe" nem "e-mail já cadastrado". Idempotente: se o slug não existir, só avisa e
  sai, sem erro.

### Rodando o reset contra o banco local (dev)

Sem preparo nenhum — usa o `DB_URL` do seu `.env` direto:

```bash
npm run reset:test-restaurant -- --slug=meu-restaurante
```

### Rodando o reset contra produção (banco na EC2)

A porta do Mongo na EC2 não é pública (fechada por segurança) — só dá pra chegar nela por um
túnel SSH.

**1. Abra um terminal e crie o túnel** (deixe essa janela aberta, sem digitar mais nada nela):

```bash
ssh -i <caminho-da-chave.pem> -L 27018:localhost:27017 ubuntu@<ip-da-ec2>
```

Usa a porta local `27018` (não `27017`) de propósito — evita conflito se você já tiver um Mongo
rodando localmente na porta padrão, como no ambiente de desenvolvimento deste projeto.

**2. Em outro terminal**, na raiz deste repositório:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
DB_URL="mongodb://<usuario>:<senha>@localhost:27018/mobbs-delivery?authSource=admin" npm run reset:test-restaurant -- --slug=meu-restaurante
```

`<usuario>`/`<senha>` são as credenciais do Mongo **de produção** (`MONGO_USER`/`MONGO_PASSWORD`
do `.env` que está na própria instância EC2, não as do seu `.env` local — são bancos
diferentes). A variável `DB_URL` na linha de comando só vale pra essa execução, não altera seu
`.env` local.

Ao final, o script imprime quantos documentos apagou por coleção e quais e-mails removeu do
Firebase.

## Pendências

- **Documentação da API (Swagger/OpenAPI)** — decidido em `docs/architecture/patterns.md` §16.7
  ("OpenAPI escrito à mão em `swagger.spec.ts`, servido em `/docs` via Swagger UI", mesmo esquema
  de `rotas-sz-bff`), **ainda não implementado**. Cobrir, quando for feito, todos os endpoints já
  ativos em `main.ts` (`restaurants`, `restaurant-operators`, `catalog`, `orders`,
  `raw-materials`) — necessário pra testar a API manualmente sem depender de um cliente HTTP
  escrito à mão (Postman/Insomnia/curl).
- ~~Sem rota pública de criação do primeiro `Restaurant`/`RestaurantOperator`~~ — resolvido em
  `specs/0038-autocadastro-restaurante`: `POST /restaurants/signup` (só `firebaseAuthMiddleware`,
  sem exigir operador prévio) cria o restaurante e o primeiro operador (`dono`) automaticamente.
  O script `seed:restaurant` continua útil só pra criar um restaurante de teste sem passar pelo
  fluxo de autocadastro de verdade.
