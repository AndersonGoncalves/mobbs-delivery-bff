# Mercado Pago — o que fazer na homologação e na produção

Registro de 24/11/2026, depois do primeiro teste local de ponta a ponta da configuração (webhook +
vínculo OAuth).

> **Decisão de 24/11/2026 (`specs/0226`):** o Mercado Pago passa a ser o **único provedor dos
> pagamentos dos pedidos** — cartão de crédito online **e** Pix com confirmação automática (este
> ainda em desenvolvimento). A chave Pix manual do restaurante continua (padrão pra quem não
> vincula e reserva se o Mercado Pago falhar). O **Asaas fica só com a mensalidade da plataforma**. Complementa [`./mercado-pago.md`](./mercado-pago.md) (conta e custos) e
[`../MERCADO-PAGO.md`](../MERCADO-PAGO.md) (técnico). Nenhuma senha ou token neste arquivo — só onde
cada coisa está.

## 1. Estado atual

### Aplicação no Mercado Pago Developers

| Item | Valor |
|---|---|
| Nome | **BsDelivery Teste** (renomear antes de produção — ver §4) |
| Dona da aplicação | conta Mercado Pago pessoal do Anderson (ver §5) |
| Application / Client ID | `6705454643801975` |
| Produto / tipo de API | Checkout Pro, **API de Preferences** (marcada como legado — ver §6) |
| PKCE | Sim |
| Permissões | read, offline access, write |
| URLs de redirecionamento | `https://hml.bsdelivery.com.br/painel/settings/mercadopago/callback` + uma URL de túnel do teste local (**morta**, pode remover) |
| Webhook — modo de teste | evento **"Pagamentos (legacy)"**; URL aponta pro túnel do teste local (**morta** — trocar na homologação, §2) |
| Webhook — modo de produção | **não configurado** |
| Credenciais de teste | ativadas |
| Credenciais de produção | ativadas (só pra obter o Client Secret). **O Access Token de produção apareceu num print** → renovar (§4) |

### Contas de teste (painel → Contas de teste)

| Conta | User ID | Papel | Uso |
|---|---|---|---|
| Seller Test User | 3874968670 | **Plataforma** — dona do token de teste (`MERCADOPAGO_PLATFORM_ACCESS_TOKEN`) | **Nunca** vincular a um restaurante (esconderia o problema do §6) |
| **Restaurante teste** | 3874969016 | **Restaurante** (vendedor) | Vincular aos restaurantes de teste (local e homologação) |
| **Cliente teste** | 3874969014 | **Cliente** (comprador, R$ 1.000 fictícios) | Pagar os pedidos de teste |
| Buyer Test User | 3874757368 | Sobra (criada pelo Mercado Pago) | — |

Login nas contas de teste: pelo **usuário** `TESTUSER…` completo (copiar pelo ícone no painel), não
por CPF/e-mail; código de verificação = **6 últimos dígitos do User ID**. Fazer o vínculo numa
**janela anônima** (senão a aba de autorização usa a conta real logada no navegador).

### Onde estão as credenciais

| Arquivo | Conteúdo Mercado Pago |
|---|---|
| `mobbs-delivery-bff/.env` (local) | Client ID, Client Secret, token **de teste**, assinatura do webhook |
| `mobbs-delivery-bff/.envs/.env.hml` | os mesmos + `MERCADOPAGO_REDIRECT_URI`, `BFF_PUBLIC_BASE_URL`, `PUBLIC_APP_BASE_URL` da homologação |
| `mobbs-delivery-bff/.envs/.env.prd` | **nada** — Mercado Pago ainda não configurado em produção |

Todos fora do git. Client ID/Secret e token de teste foram validados contra a API do Mercado Pago.

### O que já foi validado (teste local, 24/11/2026)

- ✅ Webhook chega ao BFF e a **assinatura secreta é aceita** (aviso simulado → BFF consultou o
  pagamento fictício → 404, como esperado).
- ✅ **Vínculo OAuth** com a "Restaurante teste" gravado no Bs Delivery local
  (`mercadoPagoUserId = 3874969016`).
- ⏳ **Pagamento real de teste — ainda não feito** (falta ativar "Cartão de Crédito Online" e rodar o
  app do cliente).

## 2. Homologação — o que fazer

Os passos longos (criar aplicação, credenciais, contas de teste) **não se repetem**.

- [ ] Painel → Webhooks → **Modo de teste**: trocar a URL por
      `https://api.hml.bsdelivery.com.br/webhooks/mercadopago` (o modo de teste aceita uma URL só; se
      voltar a testar no local, troca de novo). Conferir se a assinatura secreta continua a mesma do
      `.env.hml`; se o painel gerar outra, atualizar o `.env.hml` e o `.env` do servidor.
- [ ] Painel → Configuração avançada: remover a URL de redirecionamento do túnel (opcional).
- [ ] Ligar o menu no banco da homologação: `npm run activate:mercadopago-integration` (todo banco
      novo nasce com o menu desligado).
- [ ] Vincular um restaurante da homologação (ex. `pizzaria`) com a **Restaurante teste**, em janela
      anônima, abrindo a retaguarda pelo próprio domínio `hml.bsdelivery.com.br` (o vínculo é por
      banco — o do local não vale lá).
- [ ] Configurações → Formas de pagamento → marcar **"Cartão de Crédito Online"** (não confundir com
      "Cartão de Crédito", que é maquininha).
- [ ] Pedido de teste pelo app do cliente da homologação (`/pizzaria`), pagando com a **Cliente
      teste** e um cartão de teste (painel → Cartões de teste). Conferir no log do BFF:
      `[webhook] POST /webhooks/mercadopago → 200` e o pedido virar "pago".
- [ ] Testar também cartão **recusado** (pedido não pode ser confirmado) e **cancelamento com
      estorno**.
- [ ] **Observar o risco do §6.1**: se o aviso chegar e o log mostrar 404 ao consultar um pagamento
      que existe, é a consulta com o token da plataforma — corrigir antes de produção.
- [ ] Passar ao QA: usuário/senha da **Restaurante teste** e da **Cliente teste** + números de cartão
      de teste (roteiro: `roteiro-qa-integracoes.md` §2).

## 3. Produção — o que fazer

Só depois da homologação aprovada e das decisões do §5 e §6. **Pré-requisito de código:** a parte A
da `specs/0226` — **implementada em 24/11/2026** (valor total com taxa de entrega/descontos, estorno
com o id do pagamento, Pix/boleto fora do checkout de cartão, webhook conferindo o restaurante e
consultando com o token dele, campo de provedor, cartão só pelo Mercado Pago). Falta validar com
pagamento real no sandbox (homologação) antes de produção.

| Item | Teste (local/hml) | Produção |
|---|---|---|
| Aplicação | BsDelivery Teste | a mesma aplicação (renomeada) — ou uma nova, se §5/§6 exigirem |
| Client ID / Secret | os atuais | os mesmos (Secret **renovado**) |
| Token da plataforma | de teste | **não é mais necessário** (desde a parte A da `specs/0226`, o webhook consulta com o token do restaurante) |
| Webhook | modo de teste | **modo de produção**: `https://api.bsdelivery.com.br/webhooks/mercadopago`, evento de pagamento, **outra** assinatura secreta |
| URL de redirecionamento | hml | `https://bsdelivery.com.br/painel/settings/mercadopago/callback` |
| Quem vincula | conta de teste | **cada restaurante, com a conta Mercado Pago real dele** |
| Onde configurar | `.env.hml` | `.envs/.env.prd` + `.env` do servidor de produção |

- [ ] Renomear a aplicação (o nome aparece pro restaurante na tela "Autorize a conexão do
      aplicativo…").
- [ ] Renovar o **Client Secret** e colar direto no `.env.prd` (sem passar por chat/print).
- [ ] Configurar no `.env.prd`: `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`,
      `MERCADOPAGO_WEBHOOK_SECRET` (do modo de produção), `MERCADOPAGO_REDIRECT_URI` (de produção).
      `MERCADOPAGO_PLATFORM_ACCESS_TOKEN` **não precisa** (a sua conta deixa de ter segredo no
      servidor).
- [ ] Levar ao servidor o `docker-compose.yml` novo (`specs/0215` T017 — sem ele as variáveis
      `MERCADOPAGO_*` não chegam ao container). **Antes, conferir o `.env` de produção**: as 22
      variáveis que passam a ser repassadas começam a valer.
- [ ] Cadastrar no painel a URL de redirecionamento e o webhook (modo de produção).
- [ ] `npm run activate:mercadopago-integration` no banco de produção.
- [ ] Primeiro restaurante real: vincular, ativar o cartão online, fazer um pedido pequeno de
      verdade e **conferir o dinheiro no extrato do restaurante** antes de liberar pros demais.

## 4. Segurança

- [ ] **Renovar já o Access Token de produção** (painel → Credenciais de produção → "⋮" → Renovar):
      apareceu inteiro num print e não é usado em lugar nenhum hoje — nada quebra.
- [ ] Renovar o **Client Secret** antes de vincular restaurantes reais (também apareceu no chat).
- As senhas das contas de teste apareceram em prints — sem risco real (contas de teste, sem
  dinheiro), mas dá pra regenerar no painel se quiser.

## 5. Decisão pendente — conta pessoal ou da empresa

A aplicação pertence à **conta pessoal do Anderson**. Papel dela: **integradora** (dona da
aplicação); o token de produção dela é o que o BFF usa hoje pra consultar pagamentos.

- **O dinheiro nunca passa por ela**: cada pedido é cobrado com o token do restaurante e cai direto
  na conta do restaurante; ela não recebe, não paga taxa e não aparece pro cliente final.
- **Ponto de atenção**: o vínculo de cada restaurante fica preso à **aplicação**. Mudar depois para
  uma conta com o **CNPJ da Mobbs** (ainda não existe) exigiria criar uma
  aplicação nova lá e **todos os restaurantes vincularem de novo**.
- Decidir: esperar a conta com CNPJ antes de vincular restaurantes reais, ou seguir com a conta
  pessoal aceitando um revínculo futuro.

## 6. Pendências técnicas

### 6.1 Consulta do pagamento com o token da plataforma — resolvido (parte A da `specs/0226`)

Desde 24/11/2026 o webhook acha o restaurante pelo `user_id` do aviso e consulta o pagamento com o
token dele. Texto original abaixo, como histórico.

O webhook consulta o pagamento com `MERCADOPAGO_PLATFORM_ACCESS_TOKEN` (conta da plataforma), mas o
pagamento pertence à **conta do restaurante**. O Mercado Pago pode recusar (404). Ainda **não
testado** (o teste local parou antes do pagamento). Se acontecer: o BFF passa a consultar com o
token OAuth do restaurante — e o token da plataforma deixa de ser necessário em produção (um segredo
a menos no servidor). Já previsto na `specs/0225` (REQ-4).

### 6.2 Pix com confirmação automática (`specs/0226`)

Em requisitos. Pix gerado no Mercado Pago com o token do restaurante (QR + copia e cola no app),
confirmado pelo webhook; testável no sandbox (`payer.first_name = "APRO"` aprova sozinho). Quando
ficar pronto: incluir o evento **"Order (Mercado Pago)"** no webhook (teste e produção), além do
"Pagamentos (legacy)" do cartão.

### 6.3 API de Preferences → API de Orders (`specs/0225`)

O painel avisa que a API de Preferences "será descontinuada em breve"; a documentação a marca como
legado, **sem data de desligamento**. Migração aberta em
[`specs/0225-mercado-pago-migracao-api-orders`](../../../mobbs-delivery-app/specs/0225-mercado-pago-migracao-api-orders/spec.md)
(só BFF; app e retaguarda sem mudança). Em aberto:

- se a troca exigir **aplicação nova**, os restaurantes vinculados precisam vincular de novo — por
  isso vale migrar **antes** de vincular restaurantes reais em produção;
- se a API de Orders do Checkout Pro aceita cobrar com o token do restaurante (testar no sandbox);
- **ordem (decisão do usuário)**: (a) terminar o teste do fluxo atual na homologação e depois
  migrar, ou (b) migrar direto se a API de Preferences nunca for ligada em produção.
