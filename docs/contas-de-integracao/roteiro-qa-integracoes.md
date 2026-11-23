# Roteiro pro QA — as 6 integrações

Roteiro pronto pra repassar ao QA, depois do ambiente de homologação (`specs/0215`) estar no ar.
O "porquê" de cada decisão, as pendências e as alternativas descartadas estão em
[`./homologacao-qa.md`](./homologacao-qa.md) — este arquivo é só o **passo a passo final**, sem
a discussão. Pro resto do sistema (cardápio, pedidos, PDV, caixa, estoque, operadores, impressão,
WhatsApp, fiscal funcional, conta do cliente), ver
[`mobbs-delivery-app/docs/process/roteiro-qa-funcionalidades.md`](../../../mobbs-delivery-app/docs/process/roteiro-qa-funcionalidades.md).

Convenção: ⬜ **Antes de liberar (você)** = passo que só você faz, uma vez, antes de chamar o QA.
📋 **Roteiro do QA** = o que ele segue sozinho, na ordem.

---

## 1. Asaas

⬜ **Antes de liberar:** nenhuma ação sua.

📋 **Roteiro do QA:**
1. Abra **Integrações → Asaas** na retaguarda de homologação.
2. Preencha o formulário de "dados da subconta": nome, CPF, data de nascimento, celular,
   faturamento e endereço podem ser **fictícios**. O **e-mail precisa ser um e-mail de verdade
   que você tenha acesso**.
3. Salve. Você vai receber um e-mail de boas-vindas do Asaas nesse endereço — defina sua própria
   senha e logue na subconta criada.
4. Monte um pedido de teste com Pix como forma de pagamento.
5. O sandbox do Asaas simula o pagamento sozinho — confirme que o pedido muda de status
   automaticamente, sem precisar fazer nada manual.
6. Confira o recebimento na sua própria conta Asaas (extrato/cobranças) — é independente, não
   precisa de acesso de ninguém.

---

## 2. Mercado Pago

⬜ **Antes de liberar (você):**
1. Entre no [painel Developers](https://www.mercadopago.com.br/developers/panel/app) da
   aplicação da Mobbs.
2. Crie um usuário de teste "vendedor" (representa o restaurante).
3. Crie um usuário de teste "comprador" (representa o cliente final).
4. Anote login/senha dos dois + um número de cartão de teste (listado no mesmo painel).
5. Envie esses 2 logins + o cartão de teste pro QA.

📋 **Roteiro do QA:**
1. Em **Integrações → Mercado Pago** na retaguarda, clique em "Vincular com Mercado Pago".
2. Na tela de login do Mercado Pago que abrir, entre com o usuário de teste **vendedor** recebido.
3. Autorize o vínculo.
4. Monte um pedido de teste, feche o checkout, pague com o **cartão de teste** recebido.
5. Confirme: pedido muda pra "pago", webhook chegou, valor bate.
6. Teste também pagamento recusado (existem números de cartão de teste específicos pra isso no
   painel) — o pedido não deve ser aprovado.
7. Confira o recebimento logando com o usuário **vendedor** (não precisa de acesso seu).

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

- [ ] Mercado Pago: criar 2 usuários de teste e anotar login/senha + cartão de teste
- [ ] iFood: separar `merchantId`/`clientId`/`clientSecret` da loja de teste + combinar quem gera
      o pedido de teste
- [ ] 99Food: revincular/criar loja de teste no restaurante de homologação + combinar quem gera
      o pedido de teste
- [ ] Verificar se iFood/99Food Developer Portal permitem convidar colaborador (resolveria os 2
      itens acima de vez)
