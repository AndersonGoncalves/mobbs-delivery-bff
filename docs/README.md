# mobbs-delivery-bff

BFF (Node.js + Restify + MongoDB/Mongoose) do ecossistema mobbs-delivery — consumido por
`mobbs-delivery-app` (Flutter) e `mobbs-delivery-web` (React).

## Rodar localmente sem pipeline

Guia passo a passo: [rodar-local/RUN-BFF.md](../../mobbs-delivery-app/rodar-local/RUN-BFF.md).
Para compilar e iniciar BFF + app + retaguarda, veja o
[índice local](../../mobbs-delivery-app/rodar-local/README.md).

O caminho recomendado roda Mongo local e **BFF compilado no host** (`npm run build`,
depois `npm start`). `docker compose up -d mongo` sobe somente o banco.
**`docker compose up -d` sozinho não compila seu código**: a API do Compose usa imagem GHCR.
Não é necessário pipeline, push ou acesso à EC2 para desenvolver localmente.

## Sugestões dos usuários — 0179

Todos os operadores ativos podem enviar e acompanhar sugestões da própria loja:

- `GET /restaurants/me/suggestions?page=1&pageSize=20&status=received`: `{ items, total }`.
- `POST /restaurants/me/suggestions`: `{ title, description }`; nasce `received`, revisão 0.
  Título de 3 a 150 caracteres; descrição de 10 a 5000 caracteres.
- `GET /restaurants/me/suggestions/:id`: detalhes e histórico da plataforma.
- `GET /restaurants/me/suggestions/unread`: `{ count }` de sugestões atualizadas não lidas
  pelo operador autenticado (não apenas a quantidade da página atual).
- `POST /restaurants/me/suggestions/:id/read`: `{ revision }`, retorna 204. Marca somente
  a revisão visualizada; ler não apaga o aviso dos demais operadores da loja.

Administração, com Firebase + `PLATFORM_ADMIN_EMAILS` (não exige vínculo com restaurante):

- `GET /platform/suggestions`: mesma paginação/filtro, todas as lojas.
- `GET /platform/suggestions/:id`: detalhes.
- `PATCH /platform/suggestions/:id`: `{ status, reply, revision }`; exige resposta ou mudança
  de status. Conflito de revisão retorna 409; recarregue antes de salvar novamente.

Status: `received`, `under_review`, `in_development`, `implemented`, `declined`.
Cada resposta/mudança acumula histórico datado e incrementa a revisão atomicamente.
Coleções `suggestion` e `suggestion_read`, com índices Mongoose; não é necessário seed.
Falhas de persistência são propagadas pelo tratamento HTTP padrão.

## Mercado Pago — configuração inicial

Passo a passo desde a criação da aplicação, OAuth em nova aba, PKCE, callback, webhook,
credenciais e habilitação no app: [MERCADO-PAGO.md](./MERCADO-PAGO.md).
`GET /restaurants/me/mercadopago/config` (dono/gerente) informa configuração pública e
variáveis ausentes, nunca os segredos. Application ID/callback agora vêm do BFF,
sem depender de `VITE_MERCADOPAGO_CLIENT_ID`.

## Contratos — ajustes 0176

- `GET /support/public` é público e retorna exclusivamente
  `{ whatsapp, commercialWhatsapp, financialWhatsapp, email, businessHours, trainingPriceCents,
  trainingUnlimitedItems, trainingIncludedItems, trainingExtraItemPriceCents }`.
  `whatsapp` é o contato técnico; os outros dois são comercial/financeiro.
  A configuração agora vem do singleton Mongo `supportSettings`, não de variáveis `SUPPORT_*`.
  Na home de `https://painel.bsdelivery.com.br/`, use **Suporte e treinamento**.
  `GET` e `PUT /platform/support-settings` exigem Firebase + administrador
  em `PLATFORM_ADMIN_EMAILS`. PUT exige os nove campos, sem campos extras.
  WhatsApps: DDI/DDD, somente dígitos (10–15); e-mail válido; horário não vazio até 500
  caracteres; valores em centavos inteiros não negativos; quantidade inteira não negativa.
  Antes da primeira gravação, os três setores usam `5585986404604`, e-mail
  `anndersonn.gonncalves@gmail.com`, “Horário comercial” e treinamento de 4990 centavos
  sem limite de itens. Se desativar itens ilimitados, os padrões são 50 incluídos e
  100 centavos por excedente; quantidade/adicional também são editáveis.
  Falhas de banco são propagadas, nunca substituídas por uma oferta padrão.
  Salvar persiste sem reiniciar/recompilar; outras abas recebem a atualização na próxima
  consulta/foco. Remova as cinco variáveis antigas dos ambientes de execução/deploy.
  Esta oferta não gera cobrança automática nem limita o cadastro de produtos.
- `POST /restaurants/me/orders/:id/printed`: corpo vazio, resposta `204`, idempotente,
  exige autenticação de operador dono/gerente/financeiro e pedido do mesmo restaurante.
  Chamar somente após sucesso do bridge ou confirmação explícita do operador de que
  imprimiu pelo navegador, nunca por abrir/fechar o diálogo. Registra o mesmo
  `autoPrintStatus: 'printed'` da fila automática, impedindo impressão automática duplicada
  e removendo o aviso `autoPrintMissed` nas próximas consultas. Registros históricos não são inferidos.
- `PUT /customers/me`: `document` (CPF) continua opcional, validado quando preenchido;
  omitido, `null` ou branco preservam o documento anterior. Somente o perfil autenticado
  e a exportação do próprio titular expõem esse campo; pedidos administrativos/públicos
  não o incluem. O CPF persistido é enviado sem máscara ao Asaas quando disponível;
  sem CPF o pedido continua permitido e usa o fallback Pix existente.
- `PATCH /restaurants/me/orders/:id/cancel`: operador autorizado pode cancelar também
  `saiuParaEntrega`, com motivo obrigatório e os mesmos efeitos de estoque/estorno.
  `PATCH /orders/:id/cancel` do consumidor continua limitado a `aguardandoConfirmacao`.
- `PATCH /restaurants/me/operators/:id/profile`: `photoUrl: null` remove a foto;
  `photoUrl` omitido preserva a foto. Nome e WhatsApp continuam independentes da remoção.
  Nome continua obrigatório nesse contrato de atualização.
- Listagens administrativas de pedidos incluem `deliveryMotoboy.whatsapp` opcional,
  obtido somente do operador do mesmo restaurante, inclusive se estiver inativo.
  Esse enriquecimento não se aplica às rotas de cliente ou de acompanhamento público.

## Comandos

- `npm run dev` — sobe em modo desenvolvimento (`ts-node-dev`, com reload automático).
- `npm run build` / `npm start` — build de produção (`tsc` + `node dist/main.js`).
- `npm run lint` — ESLint.
- `npm test` — Jest (guia completo, cobertura e VS Code em [`TESTES.md`](./TESTES.md)).
- `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` — compila a
  imagem local e sobe `api` + `mongo:7`.
- `docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.debug.yml up --build`
  — mesmo ambiente local com o inspector do Node exposto na porta 9229.
- `docker compose pull api && docker compose up -d --no-build` — baixa do GHCR e sobe a imagem
  já compilada usada em produção.

Pushes para `main` publicam automaticamente no GHCR as tags `latest` e
`sha-<commit-completo>`. Defina `IMAGE_TAG=sha-...` no `.env` para fixar ou restaurar uma versão
específica.

## Padrões

Ver [patterns.md §16](../../mobbs-delivery-app/docs/architecture/patterns.md) e
[overview.md](../../mobbs-delivery-app/docs/architecture/overview.md).
As specs/arquitetura compartilhadas vivem no app; este repositório tem seus próprios
guias de execução e testes em `docs/`.

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
  catálogo/pedidos/financeiro/estoque que pertence só a ele), a conta Firebase
  Authentication do(s) e-mail(is) de operador vinculados, **e** todas as imagens dele no S3
  (`restaurants/<id>/` — logo, produtos, banners, opções de adicional) — pra poder recriar o mesmo
  restaurante com o mesmo slug e o mesmo e-mail de login numa rodada de teste seguinte, sem
  esbarrar em "slug já existe" nem "e-mail já cadastrado", e sem deixar imagem órfã acumulando no
  bucket. Idempotente: se o slug não existir, só avisa e sai, sem erro; se o restaurante não tinha
  imagem nenhuma, a parte do S3 também não lança. Precisa de credenciais AWS configuradas
  (`~/.aws/credentials` ou variáveis de ambiente — mesma cadeia padrão usada pelo `s3Client`,
  `shared/storage/s3-client.ts`), além do `DB_URL`.

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

Ao final, o script imprime quantos documentos apagou por coleção, quais e-mails removeu do
Firebase e quantos objetos apagou do S3.

**Achado real em produção (2026-09-28)**: antes desta limpeza de S3 existir, restaurantes de teste
apagados (seja pelo script na versão antiga, seja apagados manualmente no Mongo) deixavam a pasta
de imagens órfã no bucket pra sempre — não existe nenhuma rota no sistema pra excluir um
restaurante além deste script, então nada mais cobria isso. Pastas órfãs de antes desta correção
não são limpas automaticamente por uma rodada nova do script (ele só age sobre um restaurante que
ainda existe no Mongo); precisam ser apagadas à parte, uma vez, via `aws s3 rm
s3://mobbs-delivery-images/restaurants/<id>/ --recursive`.

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

## Resumo rápido — compilar e rodar local

Prepare `.env`, credencial Firebase e banco **local** primeiro, conforme
[RUN-BFF.md](../../mobbs-delivery-app/rodar-local/RUN-BFF.md).
Sem pipeline e sem container da API:

```bash
cd /home/anderson/DevPrograms/Projetos/delivery/mobbs-delivery-bff
npm ci
docker compose up -d mongo
npm run build
npm start
```

Deixe o terminal aberto. Em outro: `curl -i http://localhost:3001/support/public`.
Para editar com recarga, use `npm run dev` no lugar de build/start.
Testes não precisam desse servidor: `npm test -- --runInBand`.
