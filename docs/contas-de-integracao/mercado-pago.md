# Mercado Pago — conta, custo e como testar

Guia pra quem vai *usar* a integração, não pra quem vai mexer no código — pra isso, ver
[`../MERCADO-PAGO.md`](../MERCADO-PAGO.md) (OAuth/PKCE passo a passo, variáveis de ambiente,
diagnóstico de erro).

## 0. Duas contas diferentes envolvidas

- **A Mobbs** (uma vez só): cria **uma aplicação** no Mercado Pago Developers — é essa
  aplicação que faz o OAuth com a conta de cada loja depois.
- **Cada restaurante**: tem sua própria conta Mercado Pago (a que já usa normalmente, pra
  receber Pix/cartão) e autoriza a aplicação da Mobbs a processar pagamentos **nela** — o
  dinheiro cai direto na conta do restaurante, nunca passa pela conta da Mobbs.

## 1. Criar a aplicação (feito uma vez, pela Mobbs)

1. Entre em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app) com a conta
   Mercado Pago que vai administrar a integração.
2. Crie uma aplicação de **Checkout Pro**, modelo "integrado por desenvolvimento próprio"
   (com OAuth/PKCE habilitado, pra atuar em nome de várias lojas).
3. Isso é **gratuito** — criar a aplicação não cobra nada. A aprovação de credenciais de
   produção depende da própria conta Mercado Pago (não é automática nem garantida).
4. Guarde o **Application ID** e o **Client Secret** (não confundir com Public Key/Access
   Token) — vão nas variáveis `MERCADOPAGO_CLIENT_ID`/`MERCADOPAGO_CLIENT_SECRET` do `.env` do
   BFF (nunca na retaguarda — ver `MERCADO-PAGO.md` §2).

## 2. Quem paga o quê

- **Criar/manter a aplicação Mercado Pago**: grátis.
- **Por transação**: é o **Mercado Pago quem cobra**, descontado direto da conta de cada
  restaurante, nunca passa pela Mobbs. Taxas variam por forma de pagamento, prazo de
  recebimento e bandeira — consultadas em 02/11/2026, como referência (confirme na página
  oficial de tarifas, elas mudam com frequência):
  - **Pix**: taxas bem baixas, em alguns planos próximas de zero.
  - **Cartão de crédito à vista**: na faixa de ~3% a ~5%, dependendo do prazo de recebimento
    (recebimento mais rápido = taxa maior).
  - Parcelado sobe bastante conforme o número de parcelas.

## 3. Sandbox — usuários de teste do Mercado Pago

O Mercado Pago tem um sistema de **contas de teste** nativo do Checkout Pro: dentro da sua
aplicação no painel Developers, use a opção de criar **usuários de teste** (comprador e
vendedor **distintos** — nunca teste comprando de você mesmo com a conta real).

1. Crie um usuário de teste "vendedor" e um "comprador" no painel da aplicação.
2. Simule o fluxo de vínculo (**Integrações → Mercado Pago** na retaguarda) logado como o
   vendedor de teste.
3. Gere um pedido pequeno, abra o Checkout Pro, pague com um **cartão de teste** (o painel
   Developers lista os números válidos pro ambiente de teste).
4. Confirme: webhook chegou, pedido mudou pra "pago", valor bate, e o recebedor foi o vendedor
   de teste (nunca a conta real da loja).
5. Teste também o caminho de erro: pagamento recusado não deve aprovar o pedido.

Pra desenvolvimento local, precisa de um domínio HTTPS (túnel/dev tunnel) — `localhost` não
recebe webhook externo. Use uma aplicação **separada** pra isso, nunca aponte o callback de
produção pro ambiente local.

## 4. Indo pra produção

- O fluxo completo com credenciais reais **não foi homologado** nesta implementação — os testes
  feitos até aqui usam mocks.
- Antes de liberar aos consumidores de verdade: valide recebimento na conta vinculada (não
  presuma, confira o extrato Mercado Pago da loja), e teste reenvio de webhook (não deve
  duplicar a confirmação).
- Renovação automática de token expirado **ainda não está conectada** — se o vínculo expirar ou
  for revogado, o operador usa **"Vincular novamente"** na própria tela.

Checklist completo de diagnóstico de erro em `MERCADO-PAGO.md` §"Diagnóstico rápido".
