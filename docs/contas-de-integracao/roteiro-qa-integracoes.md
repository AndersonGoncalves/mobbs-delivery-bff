# Roteiro pro QA — as integrações

Roteiro pronto pra repassar ao QA, depois do ambiente de homologação (`specs/0215`) estar no ar.
O "porquê" de cada decisão, as pendências e as alternativas descartadas estão em
[`./homologacao-qa.md`](./homologacao-qa.md) — este arquivo é só o **passo a passo final**, sem
a discussão. Pro resto do sistema (cardápio, pedidos, PDV, caixa, estoque, operadores, impressão,
WhatsApp, fiscal funcional, conta do cliente), ver
[`mobbs-delivery-app/docs/process/roteiro-qa-funcionalidades.md`](../../../mobbs-delivery-app/docs/process/roteiro-qa-funcionalidades.md).

Convenção: ⬜ **Antes de liberar (você)** = passo que só você faz, uma vez, antes de chamar o QA.
📋 **Roteiro do QA** = o que ele segue sozinho, na ordem.

> **Decisão de 24/11/2026 (`specs/0226`):** os pagamentos **dos pedidos** (Pix automático e cartão
> online) passam a ser **só pelo Mercado Pago** (+ chave Pix manual do restaurante). O **Asaas** fica
> só com a mensalidade da plataforma e **não é testado pelo QA**. Restaurante **com** Mercado Pago
> vinculado: o Pix é gerado lá e o pedido confirma sozinho. **Sem** vínculo: Pix pela chave manual,
> confirmado pelo operador ("Pix recebido").

---

## 1. Asaas — não testar

O Asaas não é mais usado nos pagamentos dos pedidos (decisão de 24/11/2026). A tela
**Integrações → Asaas** não deve ser usada; se ainda aparecer na retaguarda de homologação, ignore.

---

## 2. Mercado Pago (Pix automático e cartão de crédito online)

✅ **Antes de liberar (você):** feito em 26/11/2026 (`specs/0215` T021) — aplicação própria
"BsDelivery Homologacao", contas de teste e menu ligado (`./mercado-pago-hml-producao.md` §1-§2).
Mandar ao QA o usuário/senha da **"Cliente teste"** e da **"Cliente teste 2"** (compradoras) + o
cartão de teste. Os restaurantes já vêm vinculados, cada um com a sua conta ("Pizzaria teste",
"Hamburgueria teste", "Pastelaria teste"); só mande uma dessas se ele for testar o
Desvincular/Vincular daquele restaurante.

📋 **Roteiro do QA:**
1. Abra uma **janela anônima** (Ctrl+Shift+N) e entre na retaguarda de homologação
   (`https://hml.bsdelivery.com.br/painel`). A janela anônima evita que o vínculo use alguma conta
   Mercado Pago sua que esteja logada no navegador.
2. **Integrações → Mercado Pago → "Vincular com Mercado Pago"**. Na aba que abrir:
   - país **Brasil**;
   - login com o **usuário** da conta de teste **daquele restaurante** ("Pizzaria teste",
     "Hamburgueria teste" ou "Pastelaria teste" — `TESTUSER…`, não é CPF nem e-mail) e a senha
     dela. Nunca a mesma conta em dois restaurantes; se pedir código, use os **6 últimos dígitos do User ID** dela;
   - **Autorizar**. Você volta para a retaguarda com "Conta vinculada com sucesso"; feche a aba e
     clique em **"Atualizar vínculo"** na aba original.
3. **Configurações → Formas de pagamento** → marque **"PIX"** e **"Cartão de Crédito Online"** e
   salve (não é o "Cartão de Crédito" comum, que é maquininha).

**Pix automático:**

4. No app do cliente, entre com uma conta de cliente cujo **nome comece com `APRO`** (ex. "APRO
   Teste"; altere em Perfil se precisar). No sandbox do Mercado Pago, esse nome faz o Pix ser
   **pago sozinho** em alguns segundos — não existe como pagar um Pix de teste pelo app do banco.
5. Faça um pedido com **Pix**. Confira: aparecem o QR Code e o copia e cola, e na retaguarda o card
   mostra **"Pix automático — Mercado Pago"**.
6. Em até ~30 s (sem clicar em nada): o pagamento vira **pago** no app e na retaguarda, chega o
   WhatsApp de "Pix confirmado" (se o WhatsApp do restaurante estiver conectado), e o log mostra
   `[webhook] POST /webhooks/mercadopago → 200`. Se em Formas de pagamento o PIX estiver com
   **"confirma pedido automaticamente"** marcado, o pedido também passa sozinho para "Confirmado"
   (senão, o operador confirma). O Pix entra no caixa quando o pedido é confirmado.
7. **Pix não pago:** com um cliente de **outro nome** (que não comece com `APRO`), faça um pedido com
   Pix — ele fica aguardando pagamento. Cancele o pedido: a cobrança é cancelada no Mercado Pago.
8. **Estorno:** cancele um pedido com Pix **já pago** (passo 6) — o pagamento fica "estornado".
9. O código Pix que chega no WhatsApp do cliente tem que ser **o mesmo** que o app mostra.
10. O botão **"Pix recebido"** continua no card como reserva — não precisa usar no Pix automático.

**Cartão de crédito online:**

11. No app do cliente, faça um pedido com **Cartão de Crédito Online**; no checkout do Mercado Pago,
    escolha **"Entrar com a minha conta"** e entre com a **Cliente teste** (ou **Cliente teste 2**) —
    como visitante ("Cartão" sem conta) o Mercado Pago recusa com "uma das partes é de teste". Pague
    com o Mastercard de teste `5480 8328 0103 3311`, CVV `123`, validade `11/30`, CPF
    `12345678909` e **titular `APRO`** (aprovado).
12. Confirme: pedido muda pra "pago" sozinho e o aviso aparece nos logs
    (`[webhook] POST /webhooks/mercadopago → 200`).
13. Teste também **cartão recusado**: mesmo cartão com **titular `FUND`** (saldo insuficiente) ou
    `OTHE` (erro geral) — o pedido não deve ser aprovado. Se sair do checkout sem pagar, o botão
    **"Pagar agora"** no acompanhamento do pedido reabre o pagamento.
14. Teste **cancelamento de pedido pago** — o valor deve ser estornado.

**Confira com atenção (novo ou corrigido em 24/11/2026, `specs/0226` — primeira vez testado com
pagamento de verdade no sandbox):**
- Pix: confirmação **sem clique** do operador, e **uma vez só** (um WhatsApp de "Pix confirmado",
  não dois);
- Pix: restaurante **sem chave Pix manual**, só com o Mercado Pago, também tem que oferecer Pix;
- o valor cobrado no Mercado Pago tem que ser o **total do pedido**, com taxa de entrega e descontos;
- o **estorno** do cartão online tem que funcionar no cancelamento;
- o checkout de cartão **não** pode oferecer Pix nem boleto.

---

## 3. iFood

⬜ **Antes de liberar (você):**
1. Envie ao QA as credenciais da loja de teste já existente: `merchantId`
   (`4fce20c8-d631-4bea-ab81-6d451dbb69a7`), `clientId` e `clientSecret` (pegue no seu `.env`/
   painel iFood Developer — app "Teste (C)").
2. **Combine com o QA como vão gerar o pedido de teste** — hoje isso só é possível de dentro do
   seu login no portal iFood Developer (verificar se dá pra convidar colaborador; se não, você
   gera o pedido quando ele avisar que está pronto pra esse passo).

📋 **Roteiro do QA:**
1. Em **Integrações → iFood** na retaguarda, preencha `merchantId`/`clientId`/`clientSecret`
   recebidos.
2. Avise você (ou, se tiver acesso ao portal, acesse **Test orders → Generate test order**
   sozinho) pra gerar um pedido de teste.
3. Confirme que o pedido aparece na lista da retaguarda em até ~30s, com a etiqueta "iFood".
4. Confirme o pedido pela retaguarda e confira que a ação reflete de volta no iFood.
5. Teste cancelamento também.
6. **Gap conhecido pra reportar, não é bug:** avançar o pedido até "Entregue" na retaguarda não
   reflete de volta no iFood — ele fica parado em "Confirmado" do lado deles. Isso é esperado
   nesta versão, não precisa reportar como falha.

---

## 4. 99Food

⬜ **Antes de liberar (você):**
1. Revincule a loja de teste `bsdelivery-teste-01` ao restaurante de teste do ambiente de
   homologação (ou crie uma nova, via **Gerenciamento de aplicativo → Ver detalhes do app →
   "Adicionar estabelecimento de teste"**, só funciona no app "Ambiente de teste").
2. **Combine com o QA como vão gerar o pedido de teste** — mesma ressalva do iFood: a
   "Ferramenta de pedido de teste" fica no seu portal de desenvolvedor.

📋 **Roteiro do QA:**
1. Confirme em **Integrações → 99Food** na retaguarda que o restaurante já aparece vinculado
   (feito por você no passo anterior).
2. Avise você (ou gere sozinho, se tiver acesso) um pedido de teste via **Ambiente sandbox →
   Ferramenta de pedido de teste**, selecionando `bsdelivery-teste-01`.
3. Confirme que o pedido chega na retaguarda via webhook, com a etiqueta "99Food".
4. **Confirme o pedido em até 5 minutos** — a 99Food cancela automaticamente depois disso.
5. Teste **"Ativar 99 Entrega"** num pedido 99Food avançado até "Em preparo" — o botão
   "Despachar via 99 Entrega" só aparece em pedidos com origem 99Food (não aparece em pedido
   iFood, por exemplo — não é bug).

---

## 5. Fiscal (FocusNFe)

⬜ **Antes de liberar:** nenhuma ação sua.

📋 **Roteiro do QA:**
1. Cadastre-se em [focusnfe.com.br](https://focusnfe.com.br/) com CNPJ e certificado digital A1
   próprios.
2. No painel, vá em **"Painel API" → "Tokens"** e copie o **token de homologação** (não o de
   produção).
3. Em **Integrações → Fiscal** na retaguarda, conecte com `environment: 'homologacao'` + esse
   token + o CNPJ cadastrado.
4. Entregue um pedido de teste — a emissão de NFCe deve disparar automaticamente nesse status.
5. Confira o resultado (autorizada/rejeitada) direto no card do pedido.
6. **Atenção redobrada aqui** — é a única integração nunca testada de ponta a ponta com
   homologação real. Reporte qualquer erro, mesmo que pareça "estranho" ou fora do script normal
   de teste.
7. Teste também um cenário de rejeição proposital (ex.: CFOP inválido, se der pra forçar) pra ver
   se o sistema trata o erro sem travar o pedido.

---

## 6. Uber Entregas

⬜ **Antes de liberar:** nenhuma ação sua.

📋 **Roteiro do QA:**
1. Cadastre-se em [developer.uber.com](https://developer.uber.com/) com uma conta de negócio
   (não precisa de CNAE de tecnologia).
2. Crie um app de teste — anote `client_id`/`client_secret`/`customer_id`.
3. Em **Integrações → Uber Entregas** na retaguarda, preencha essas credenciais + o CEP de
   origem das entregas.
4. **Copie a URL de webhook** mostrada na tela (com token embutido) e cole na configuração de
   webhook do seu app, no painel Uber — sem isso o status não atualiza sozinho.
5. Monte um pedido, avance até "em preparo" sem motoboy próprio, clique **"Despachar via Uber
   Entregas"**.
6. Confirme que o status do chip no card do pedido avança sozinho (entrega simulada, nenhum
   motoboy real sai, nenhuma cobrança real acontece).
7. **Limitação conhecida pra reportar, não é bug:** não existe cancelamento manual de uma
   entrega já despachada — o status é 100% dirigido por webhook.

---

## Checklist rápido do que você precisa fazer ANTES de chamar o QA

- [ ] Mercado Pago: aplicação e contas de teste **já criadas**; na subida, trocar a URL do webhook
      de teste pra `api-hml`, ligar o menu e mandar ao QA usuário/senha da "Cliente teste" e
      da "Cliente teste 2" + cartão de teste (feito em 26/11/2026, falta só mandar) (`./mercado-pago-hml-producao.md` §2)
- [ ] iFood: separar `merchantId`/`clientId`/`clientSecret` da loja de teste + combinar quem gera
      o pedido de teste
- [ ] 99Food: revincular/criar loja de teste no restaurante de homologação + combinar quem gera
      o pedido de teste
- [ ] Verificar se iFood/99Food Developer Portal permitem convidar colaborador (resolveria os 2
      itens acima de vez)
- [ ] **Não** ligar o menu do Asaas na homologação (`asaasIntegrationEnabled` fica desligado)
