# Uber Entregas (Uber Direct) — entregador avulso pros pedidos próprios

`specs/0121-integracao-uber-entregas`. Diferente do iFood (`docs/IFOOD.md`, recebe pedidos de
fora): esta integração é o contrário — o pedido já é do canal próprio do mobbs, e o que falta é
quem entrega. O restaurante pede um entregador avulso e externo da Uber pra um pedido específico,
como alternativa ao motoboy próprio (nunca uma substituição, nem uma escolha automática — o
operador decide pedido a pedido, REQ-4).

## 1. Cadastro no Portal do Desenvolvedor Uber (feito pelo restaurante, fora do mobbs)

1. O restaurante cria/acessa uma conta em [developer.uber.com](https://developer.uber.com),
   registra uma aplicação com acesso ao produto **Uber Direct**.
2. O portal devolve `customer_id` (conta Uber Direct do negócio) e as credenciais OAuth2
   client-credentials da aplicação (`client_id`/`client_secret`).
3. O restaurante configura, no mesmo portal, a URL de webhook de status — ver seção 4.

## 2. Conectar na retaguarda (dono/gerente)

1. Abra **Integrações → Uber Entregas** em `https://bsdelivery.com.br/painel`.
2. Preencha "Uber ID de cliente do desenvolvedor" (`customerId`), "Client Secret"
   (`clientSecret`), "ID do usuário" (`clientId` — ver suposição #4 abaixo) e o CEP de origem do
   negócio (ponto de coleta).
3. `clientSecret` nunca é devolvido numa resposta de API depois de salvo (mesmo cuidado de
   `focusNfeToken`/`ifoodClientSecret`) — pra trocar a credencial, desconecte e reconecte.

## 3. Como despachar um pedido (ação manual, nunca automática)

No pedido de delivery já confirmado, o operador clica "Despachar via Uber Entregas" (ao lado da
atribuição de motoboy próprio) — o BFF pede uma cotação e, se aceita, cria a entrega. Se a Uber
recusar a cotação (fora de área, sem entregador disponível), o operador vê o erro e o pedido
continua disponível pra motoboy próprio normalmente (REQ-5) — nada é alterado no pedido até a
entrega ser criada com sucesso.

Status da entrega (solicitado/aceito/a caminho/entregue/cancelado) chega por **webhook** (não
polling) e aparece no card do pedido na retaguarda. Quando a Uber confirma "entregue", o pedido
muda de `saiuParaEntrega` pra `entregue` automaticamente (REQ-6), mesmo fluxo que a entrega própria
já usa (WhatsApp, caixa automático, cashback/fidelidade, emissão fiscal se configurada).

## 4. Variáveis de ambiente

Nenhuma — assim como o iFood (`docs/IFOOD.md`), as credenciais são por restaurante (coleção
`UberDeliveryConfig`), não há nível-plataforma nesta integração.

## 5. Suposições e limitações conhecidas (sem conta de desenvolvedor real nesta sessão)

1. **Webhook sem verificação HMAC nativa**: a Uber Direct assina seus webhooks com uma Signing
   Key própria (header `x-uber-signature`/`x-postmates-signature`, HMAC-SHA256 sobre o corpo cru)
   — não implementado aqui porque o corpo já chega parseado pelo `restify.plugins.bodyParser()`
   global do servidor (capturar o corpo cru exigiria um middleware dedicado só pra esta rota, fora
   do escopo desta v1). Em vez disso, o endpoint usa o MESMO padrão de segredo compartilhado já
   usado por `/webhooks/asaas/:restaurantId`/`/webhooks/focusnfe/:restaurantId`: um `webhookToken`
   gerado por nós. Como o dashboard da Uber só aceita uma URL (não um header customizado), o
   token vai como **query param da própria URL**: ao configurar o webhook no dashboard da Uber, o
   restaurante cola `https://api.bsdelivery.com.br/webhooks/uber-direct/:restaurantId?token=...`
   (o token exato aparece na tela de configuração da retaguarda).
2. **Endpoint de consulta (GET) e cancelamento de entrega não implementados**: não confirmados na
   documentação pública acessível nesta sessão (sem conta de desenvolvedor Uber pra inspecionar a
   referência completa da API) — e não são exigidos por nenhum REQ desta v1 (REQ-3 é 100%
   webhook-driven pra status; cancelamento OPERADOR→Uber não está no escopo, só a Uber→operador
   via webhook quando ela mesma cancela).
3. **Endereço de destino aproximado**: `Order.deliveryAddress` é uma string livre nesta versão do
   sistema (não um endereço estruturado com CEP/lat-long,
   `docs/architecture/data-model.md` §Order). O `dropoff_address` enviado pra Uber usa essa
   string inteira como uma única linha de rua, com cidade/UF herdados do cadastro do próprio
   restaurante (aproximação — nem sempre é a cidade real do cliente). Isso pode gerar cotações
   menos precisas, ou recusadas, até o mobbs ganhar um endereço estruturado de cliente (fora do
   escopo desta spec).
4. **"ID do usuário"** (3º campo pedido na spec, nome vindo de uma referência visual de outra
   plataforma) foi mapeado pro `client_id` do OAuth2 client-credentials — sem ele não é possível
   nem obter o token de acesso, e a documentação pública não usa esse nome exato pra nenhum campo
   real da Uber Direct.
5. **Homologação real** (credenciais de desenvolvedor Uber Direct verdadeiras) fica fora do
   controle desta sessão — a estrutura está pronta, mas nenhuma chamada foi testada contra a API
   real da Uber.

## Fora de escopo (v1)

- Rastreamento ao vivo do entregador dentro do app do mobbs (a Uber tem o próprio rastreamento).
- Qualquer mudança no custo cobrado do cliente (`Order.deliveryFee` nunca muda por causa do
  despacho via Uber — decisão explícita do usuário) ou lançamento financeiro no mobbs (a Uber
  cobra o restaurante direto, fora do sistema).
- Pedidos do Uber Eats Marketplace — produto diferente (ver `specs/0090`/`specs/0122` pra receber
  pedidos de fora).

Ver `specs/0121-integracao-uber-entregas/spec.md` pra lista completa.
