# Keeta — conectar o recebimento de pedidos

`specs/0212-integracao-keeta`. Mesmo modelo de webhook (não polling) do 99Food (`docs/99FOOD.md`),
mas o protocolo de autorização é OAuth2 padrão e o processo de credenciamento de parceiro é bem
mais burocrático — sem sandbox self-service aberto.

## 1. Cadastro de desenvolvedor na Keeta (feito uma vez, pela Mobbs, fora do mobbs)

1. Acesse [developers.mykeeta.com/#/signup](https://developers.mykeeta.com/#/signup) e crie uma
   conta de desenvolvedor — a Keeta responde em até 5 dias úteis.
2. Assine o NDA exigido antes de receber materiais de teste.
3. Desenvolva a integração (esta spec já cobre o lado do mobbs) e passe pelo **SIT**
   (autoteste + reunião de revisão com a própria Keeta) usando a conta de loja de teste que eles
   fornecem.
4. Registre a marca (brand) do mobbs junto à Keeta.
5. Conclua o **UAT em produção** — só depois disso o `appId`/`appSecret` reais ficam liberados
   pra uso em produção.
6. Durante o SIT, registre junto à Keeta as duas URLs que este BFF expõe:
   - Webhook de eventos: `https://<host-do-bff>/webhooks/keeta`
   - Callback OAuth2 (`redirectUri`): `https://<host-do-bff>/webhooks/keeta/oauth-callback`

Sem passar por todo esse processo, nada disso pode ser testado ponta a ponta — estrutura completa,
sem homologação real (ver `spec.md`/`plan.md`, "Pendências antes de produção"). É uma barreira bem
mais alta que o cadastro de parceiro do iFood/99Food.

## 2. Conectar um restaurante (dono, self-service)

1. Abra **Integrações → Keeta** em `https://bsdelivery.com.br/painel`.
2. Clique **"Gerar link para autorizar"** — abre automaticamente a página de autorização da Keeta
   numa nova aba (`merchant.mykeeta.com/m/web/openapi/authorize`).
3. Faça login com a conta de dono da loja na Keeta e autorize a vinculação.
4. A Keeta redireciona o navegador de volta pra `/painel/settings/keeta` — o status muda pra
   "Conectado" automaticamente quando o redirect chega com sucesso.

Diferente do 99Food (que casa a autorização por ordem de chegada, FIFO), aqui o `state` do OAuth2
já identifica exatamente qual restaurante gerou o link — sem ambiguidade mesmo com vários donos
autorizando ao mesmo tempo.

## 3. Como funciona o recebimento

- **Webhook** (não polling) — a Keeta envia o evento `1001` (`orderPlacedNotification`) com o
  pedido já completo pro endpoint único `POST /webhooks/keeta`, assinado (`sig`, SHA-256) com o
  `appSecret` da plataforma. A Keeta reentrega até 3x se não receber o ACK — o BFF deduplica por
  `orderViewId`.
- Pedido novo aparece na lista de pedidos da retaguarda com o chip **Keeta**, igual aos pedidos do
  canal próprio — mesmo fluxo de confirmar/preparar/entregar.
- Confirmar ou cancelar um pedido de origem Keeta na retaguarda também confirma/cancela na API
  deles (`OrdersController.tryConfirmOrderViaKeeta`/`tryCancelOrderViaKeeta`) — falha nessa
  chamada é só logada, nunca bloqueia a ação local. **Precisa confirmar em até 5 minutos** do
  pedido novo, senão a Keeta cancela automaticamente.
- Pedido de retirada (`pickup`): ao marcar "saiu para entrega" (que nesse caso significa "pronto
  pra retirar") na retaguarda, o BFF também avisa a Keeta (`/order/prepare`) — passo que não existe
  nas outras duas integrações.
- Nenhuma notificação de WhatsApp automática é enviada pra pedido de origem Keeta (REQ-7).

## Limitações conhecidas (ver `spec.md`, "Ambiguidades em aberto")

- O shape real do array de itens do pedido (`products[]`) não é documentado publicamente — o
  mapper trata tudo como opcional e nunca lança, mas pode precisar de ajuste assim que um payload
  real de teste (SIT) estiver disponível.
- Os textos dos códigos de cancelamento (`cancelCode` `"500001"`-`"500003"`) não vieram
  documentados — só `"500000"` (texto livre) é usado nesta v1.
