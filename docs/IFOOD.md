# iFood — conectar o recebimento de pedidos

`specs/0090-integracao-ifood`. Diferente do Mercado Pago (`docs/MERCADO-PAGO.md`): **não é
OAuth redirect**. O restaurante registra a própria aplicação parceira direto no Portal do
Parceiro iFood e digita as credenciais na nossa retaguarda — o BFF nunca redireciona o operador
pro iFood.

## 1. Cadastro no Portal do Parceiro iFood (feito pelo restaurante, fora do mobbs)

1. O restaurante cria/acessa a conta em [iFood for Developers](https://developer.ifood.com.br/).
2. Registra uma aplicação com acesso ao **Order API** (pedidos) do merchant dele.
3. O portal devolve três valores: `merchantId` (id da loja no iFood), `clientId` e
   `clientSecret` (credenciais OAuth2 client-credentials da aplicação).

Homologação formal junto ao iFood é exigida antes de produção real — não é uma integração que
"liga e funciona" só com credenciais de teste (ver `spec.md`, "Riscos e alternativas
consideradas").

## 2. Conectar na retaguarda (dono/gerente)

1. Abra **Integrações → iFood** em `https://bsdelivery.com.br/painel`.
2. Preencha `merchantId`, `clientId` e `clientSecret` e salve.
3. A tela passa a mostrar "Conectado" — o BFF já passa a buscar pedidos novos desse restaurante
   no próximo ciclo de polling (até 30s).

`clientSecret` nunca é devolvido numa resposta de API depois de salvo (mesmo cuidado de
`asaasApiKey`/`mercadoPagoAccessToken`) — se precisar trocar a credencial, desconecte e
reconecte com o valor novo.

## 3. Como funciona o recebimento (sem configuração adicional)

- O BFF faz **polling** (não webhook — a API pública do iFood não oferece webhook pra pedidos)
  a cada ~30s, por restaurante conectado (`IFoodPollingWorker`, `main.ts`).
- Pedido novo no iFood aparece na lista de pedidos da retaguarda com o badge **iFood**,
  igual aos pedidos do canal próprio — mesmo fluxo de confirmar/preparar/entregar.
- Confirmar ou cancelar um pedido de origem iFood na retaguarda também confirma/cancela no
  iFood (`OrdersController.tryConfirmOrderViaIFood`/`tryCancelOrderViaIFood`) — falha nessa
  chamada é só logada, nunca bloqueia a ação local.
- Nenhuma notificação de WhatsApp automática é enviada pra pedido de origem iFood (REQ-8) — o
  cliente do iFood não é necessariamente capturado como `Customer` com telefone, e o iFood já
  notifica por conta própria.

## 4. Variáveis de ambiente

Só a URL base da API, por ambiente — **não há credencial de nível-plataforma** (diferente do
Mercado Pago/Facebook): cada restaurante usa a própria `clientId`/`clientSecret`.

```dotenv
IFOOD_BASE_URL=https://merchant-api.ifood.com.br
```

Sem essa variável, o BFF usa o default de produção acima.

## Fora de escopo (v1)

- Sincronização de cardápio — o cardápio no Portal do Parceiro continua gerenciado manualmente.
- Despacho de entregador via a malha logística do próprio iFood.
- Conciliação financeira automática do repasse do iFood.

Ver `specs/0090-integracao-ifood/spec.md` pra lista completa.
