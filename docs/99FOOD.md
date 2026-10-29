# 99Food — conectar o recebimento de pedidos

`specs/0122-integracao-99food`. Diferente do iFood (`docs/IFOOD.md`): **não é polling, é
webhook**, e a credencial de nível de app (`app_id`/`app_secret`) é da **plataforma mobbs**, não
do restaurante — o que é por restaurante é só o resultado da autorização self-service.

## 1. Cadastro de parceiro no portal 99Food (feito uma vez, pela Mobbs, fora do mobbs)

1. Acesse o portal público [99Food Open Platform](https://developer-food.99app.com/pt-BR/openapi)
   (menu "Documentos do desenvolvedor") e crie uma conta em "Cadastrar-se".
2. Em "Gerenciamento de aplicativo", registre uma aplicação — o portal devolve `app_id` e
   `app_secret`.
3. Registre a URL do webhook (`https://<host-do-bff>/webhooks/99food`) na configuração da
   aplicação — **não há endpoint de auto-registro documentado**, esse passo é manual no portal.

Sem conta de parceiro aprovada, nada disso funciona em produção — estrutura completa, sem
homologação real (ver `spec.md`/`plan.md`, "Pendências antes de produção").

## 2. Conectar um restaurante (dono/gerente, self-service)

1. Abra **Integrações → 99Food** em `https://bsdelivery.com.br/painel`.
2. Clique **"Gerar link para autorizar"** — abre automaticamente a página de autorização do
   99Food numa nova aba.
3. Faça login com a conta de dono/gerente da loja no 99Food e autorize a vinculação.
4. Volte pra tela do mobbs — o status muda pra "Conectado" assim que o webhook `shopBindStatus`
   chegar (não precisa recarregar manualmente, mas pode levar alguns segundos).

**Limitação de design conhecida**: a 99Food não deixa escolher qual restaurante nosso corresponde
à autorização no momento de gerar o link — o casamento é feito pela ordem (primeiro a gerar o
link, primeiro a ser vinculado quando a autorização chegar). Evite ter dois donos gerando o link
ao mesmo tempo (ver `plan.md`, "Limitação conhecida de design").

## 3. Como funciona o recebimento

- **Webhook** (não polling) — a 99Food envia `orderNew` com o pedido já completo pro endpoint
  único `POST /webhooks/99food`, assinado (`didi-header-sign`) com o `app_secret` da plataforma.
- Pedido novo aparece na lista de pedidos da retaguarda com o chip **99Food**, igual aos pedidos
  do canal próprio — mesmo fluxo de confirmar/preparar/entregar.
- Confirmar ou cancelar um pedido de origem 99Food na retaguarda também confirma/cancela na API
  deles (`OrdersController.tryConfirmOrderVia99Food`/`tryCancelOrderVia99Food`) — falha nessa
  chamada é só logada, nunca bloqueia a ação local. **Precisa confirmar em até 5 minutos** do
  pedido novo, senão a 99Food cancela automaticamente.
- Nenhuma notificação de WhatsApp automática é enviada pra pedido de origem 99Food (REQ-7).

## 4. Variáveis de ambiente

```dotenv
NINETY_NINE_FOOD_BASE_URL=https://openapi.99food.com
NINETY_NINE_FOOD_APP_ID=
NINETY_NINE_FOOD_APP_SECRET=
```

`NINETY_NINE_FOOD_APP_ID`/`NINETY_NINE_FOOD_APP_SECRET` vêm do cadastro de parceiro (passo 1)
— sem eles, o botão "Gerar link para autorizar" responde erro (`appConfigured`,
`NinetyNineFoodOnboardingController`). `NINETY_NINE_FOOD_BASE_URL` só muda se a 99Food fornecer
um ambiente de testes com URL diferente.

## Fora de escopo (v1)

- Sincronização de cardápio — o cardápio no painel da 99Food continua gerenciado manualmente.
- Despacho de entregador via a malha logística da própria 99Food.
- Conciliação financeira automática do repasse da 99Food.
- Resposta automática a `orderCancelApply`/`orderRefundApply` (pedidos de cancelamento/reembolso
  feitos pelo cliente) — a própria 99Food decide automaticamente se não respondermos no prazo.

Ver `specs/0122-integracao-99food/spec.md` e `plan.md` pra lista completa e o contrato técnico
detalhado.
