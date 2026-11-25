# Homologação iFood / 99Food / 99 Entrega — 22/11/2026

Resumo do que foi feito nesta sessão pra sair de "estrutura pronta, nunca homologada" (ver
`contas-de-integracao/ifood.md`/`99food.md`) pra **os três canais testados ponta a ponta em
produção**, com 2 bugs reais encontrados e corrigidos no caminho. Guias técnicos de cada
integração continuam em `IFOOD.md`/`99FOOD.md`; este arquivo é só o registro de "o que
aconteceu", não substitui aqueles.

## 1. iFood

1. **Tipo de app certo identificado**: o 99Food/iFood têm 2 tipos de app no portal —
   **Centralized** (`Client Credentials`) e **Distributed** (`Authorization Code`, fluxo OAuth
   com redirecionamento). Nosso código (`ifood-auth.service.ts`) só implementa
   `grant_type=client_credentials` — **Centralized é o tipo certo**, Distributed não serve sem
   reescrever a autenticação.
2. Usado o app de teste **"Teste (C)" (Centralized)**, que já vinha com um merchant de teste
   pré-vinculado automaticamente (`Teste - DATA CONSULTORIA E SOLUCOES EM TECNOLOGIA LTDA`,
   `merchantId 4fce20c8-d631-4bea-ab81-6d451dbb69a7`).
3. **Liberado o menu "iFood" na retaguarda**: `platformConfig.ifoodIntegrationEnabled` estava
   `false` por padrão (specs/0209) — ativado direto no Mongo de produção (documento singleton
   `platformConfig`), carimbando `ifoodIntegrationEnabledAt` (libera a tag "Novo" por 30 dias).
4. Credenciais (`merchantId`/`clientId`/`clientSecret`) preenchidas em
   **Integrações → iFood** na retaguarda, pro restaurante "BsDelivery".
5. Pedido de teste gerado no portal do iFood (**Test orders → Generate test order**).
6. **Bug real encontrado e corrigido**: a API real do iFood devolve `unitPrice`/`totalPrice`/
   `orderAmount`/`deliveryFee` como **número direto**, não como objeto `{ value: number }` (a
   suposição original da spec 0090). Isso fazia a criação do pedido falhar
   (`Cast to Number failed for value "NaN"`) — afetaria qualquer pedido real, não só o de teste.
   Corrigido em `ifood-client.ts`/`ifood-order-mapper.ts` + testes.
   **PR [#28](https://github.com/AndersonGoncalves/mobbs-delivery-bff/pull/28), mesclado.**
7. Depois do deploy, o pedido de teste foi criado com sucesso no próximo ciclo de polling (30s),
   confirmado direto no Mongo de produção (valores batendo com o payload real do iFood).
8. **Gap conhecido, não resolvido ainda**: nosso código só propaga **Confirmar**
   (`tryConfirmOrderViaIFood`) e **Cancelar** (`tryCancelOrderViaIFood`) de volta pro iFood — não
   existe chamada pra "saiu pra entrega"/"entregue". O pedido fica parado em "Confirmado" do lado
   do iFood pra sempre, mesmo que avance até "Entregue" na nossa retaguarda. Decidir se cabe numa
   spec futura.

## 2. 99Food

1. **App de produção criado separado do de teste**: "BsDelivery Produção" (`app_id
   5764607536928393259`), diferente do antigo "BsDelivery Homologação"/teste (`app_id
   5764607603705907205`) — aplicado no `.env` real do servidor + `docker-compose.yml` (variáveis
   já repassadas pro container).
2. **Liberado o menu "99Food" na retaguarda**: mesmo mecanismo do iFood,
   `platformConfig.ninetyNineFoodIntegrationEnabled` ativado no Mongo de produção.
3. **Fluxo self-service de autorização ("Gerar link") não funciona sem uma loja de teste
   própria** — diferente do iFood, o 99Food não vem com nenhum merchant de teste pré-vinculado, e
   o link de autorização exige login de **lojista** (conta separada da conta de desenvolvedor),
   que não existia.
4. **Achada a forma certa de criar uma loja de teste**: documentado em
   *Documentos do desenvolvedor → Tools Introduction → "Adding a Test Store"* — dentro de
   **Gerenciamento de aplicativo → Ver detalhes do app → "Adicionar estabelecimento de teste"**
   (só funciona em app tipo "Ambiente de teste"). Preenchendo o campo **"Definir gerente do
   estabelecimento"** com um telefone, a vinculação acontece **automaticamente** (webhook
   `shopBindStatus` chega sozinho, sem precisar do login de lojista manual).
5. Loja de teste criada (`AppShopID: bsdelivery-teste-01`) — confirmado no Mongo:
   `ninetyNineFoodAppShopId`/`ninetyNineFoodAuthToken`/`ninetyNineFoodConnectedAt` preenchidos no
   restaurante "BsDelivery".
6. Durante o teste, o `.env` de produção foi **temporariamente trocado pro `app_id` de teste**
   (`5764607603705907205`) pra não misturar com o app de produção real — revertido de volta pro
   `app_id` de produção (`5764607536928393259`) ao final dos testes (container recriado e
   confirmado via `printenv` nos dois sentidos).
7. Pedido de teste gerado via **Ambiente sandbox → Ferramenta de pedido de teste**, selecionando
   a loja `bsdelivery-teste-01`.
8. **Bug real encontrado e corrigido**: o webhook `orderNew` não era idempotente — a 99Food
   reenvia o mesmo evento (retry deles), e `handleOrderNew` criava um pedido novo a cada reenvio
   (1 pedido de teste virou 3 pedidos duplicados — #228/#229/#230 — na retaguarda). Corrigido
   checando `findByNinetyNineFoodOrderId` antes de criar + teste novo.
   **PR [#29](https://github.com/AndersonGoncalves/mobbs-delivery-bff/pull/29), mesclado.**
   Os 3 pedidos duplicados foram apagados do banco de produção depois do fix confirmado.

## 3. 99 Entrega

1. Ativado em **Integrações → 99Food → "Ativar 99 Entrega"** (ativação por restaurante, separada
   do switch global de plataforma) — registra a autorização de entrega junto ao 99Food
   (`POST /v3/entrega/authorization/register`), reaproveitando o mesmo `auth_token` da loja.
2. **Achado de UX confirmado**: o botão "Despachar via 99 Entrega" só aparece em pedidos com
   `source === '99food'` — testar com um pedido iFood em preparo não mostra o botão (confundiu o
   teste numa tentativa).
3. Despacho testado com sucesso num pedido 99Food de teste avançado até "Em preparo".

## Pendência resolvida

- O restaurante "BsDelivery" estava com o vínculo 99Food ainda apontando pros dados da **loja de
  teste** (`bsdelivery-teste-01`) mesmo com o `.env` de produção já revertido pro app real.
  Desvinculado direto no Mongo de produção (`restaurant` collection, documento "BsDelivery"): os 6
  campos (`ninetyNineFoodAppShopId`, `ninetyNineFoodAuthToken`, `ninetyNineFoodTokenExpiresAt`,
  `ninetyNineFoodConnectedAt`, `ninetyNineFoodAuthorizationPendingAt`,
  `ninetyNineFoodEntregaActivatedAt`) foram removidos — confirmado via `findOne` só devolvendo o
  `_id`. O fluxo normal de "Gerar link para autorizar" em Integrações → 99Food está pronto pra
  conectar um restaurante real ao app de produção do zero.
