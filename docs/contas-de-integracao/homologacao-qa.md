# Preparar as 6 integrações pro QA testar (ambiente de homologação)

Guia de preparação pra quando o ambiente de homologação (`specs/0215-ambiente-homologacao`)
estiver pronto e um QA for validar o sistema inteiro. Cada integração já tem seu próprio guia
completo de conta/custo/sandbox em `./asaas.md`, `./mercado-pago.md`, `./ifood.md`, `./99food.md`,
`./focusnfe.md`, `./uber-direct.md` — este arquivo é só o resumo prático de **quem precisa
cadastrar o quê antes de liberar pro QA**, e se o QA consegue fazer isso sozinho (como se fosse
um cliente real se cadastrando em produção) ou se depende de uma ação sua primeiro.

Esse conteúdo é insumo pro documento final de onboarding do QA (`specs/0215` REQ-7/T011) — só não
dá pra fechar aquele ainda porque depende do servidor de homologação existir (URLs, slugs dos
restaurantes de teste).

## Resumo

| Integração | Credencial é de quem | QA se cadastra sozinho? | Ação sua antes de liberar |
|---|---|---|---|
| ~~Asaas~~ | — | — | **Não usado nos pedidos** desde 24/11/2026 (só mensalidade da plataforma) — QA não testa |
| Mercado Pago | Aplicação (Mobbs) + conta de cada loja | Não | **Já feito** (aplicação e contas de teste, 24/11/2026); na subida: webhook de teste → `api-hml` |
| iFood | App de teste (Mobbs, CNAE de tecnologia) | Não | Nenhuma — já existe de 22/11, só repassar credenciais |
| 99Food | App da Mobbs + loja de teste própria | Não | Criar a loja de teste no portal (ou reaproveitar `bsdelivery-teste-01`) |
| Fiscal (FocusNFe) | Empresa emitente própria do QA (CNPJ + certificado dele) | Sim — cadastro independente, sem vínculo com a Mobbs | Nenhuma |
| Uber Entregas | Por restaurante (conta de negócio) | Sim — vetting leve, sem CNAE exigido | Nenhuma |

## 1. Asaas — fora dos pedidos (decisão de 24/11/2026)

O Asaas deixou de ser usado nos pagamentos dos pedidos (`specs/0226`): Pix automático e cartão
online passam a ser só pelo **Mercado Pago**, e a chave Pix manual do restaurante continua. O Asaas
fica só com a **mensalidade da plataforma** (`specs/0175`, conta da Mobbs cobrando os
restaurantes) — não é algo que o QA testa como restaurante. Motivo da troca: as subcontas Asaas por
restaurante exigiriam CNPJ da Mobbs (regra do Banco Central); no Mercado Pago cada restaurante usa a
própria conta, sem subconta.

**O que entregar ao QA:** nada — e orientar a **não** usar a tela Integrações → Asaas.

## 2. Mercado Pago — depende de você

A aplicação (Client ID/Secret) é da Mobbs, configurada uma vez no `.env` — **isso não é o que o
QA usa**, fica só no servidor, ele nunca precisa ver esse valor. Os **usuários de teste**
(comprador e vendedor) só podem ser criados por quem tem acesso ao painel Developers dessa
aplicação — não é algo que o QA consiga se cadastrar sozinho como faria em produção.

**Já feito (24/11/2026):** aplicação de teste "BsDelivery Teste" e as contas **"Restaurante teste"**
(vendedora, vincular ao restaurante) e **"Cliente teste"** (compradora) — detalhes, papéis de cada
conta e o que falta na subida em [`./mercado-pago-hml-producao.md`](./mercado-pago-hml-producao.md).
**Não** usar a "Seller Test User" no vínculo (é a conta da plataforma, dona do token de teste).

Pix automático pelo Mercado Pago (`specs/0226`) ainda em desenvolvimento — quando ficar pronto, o QA
testa com as mesmas contas.

**O que entregar ao QA:** login/senha dos 2 usuários de teste (não o Client ID/Secret) + um
número de cartão de teste (listado no mesmo painel). Com esse login, o QA entra normalmente no
Mercado Pago como se fosse dono do restaurante, e vê os pagamentos de teste na própria conta
dele.

## 3. iFood — já está pronto, só repassar

Diferente do que pode parecer, o QA **não consegue se cadastrar sozinho** aqui — o portal do
iFood exige um CNPJ com **CNAE de tecnologia** (não serve CNPJ de restaurante nem CPF, ver
`./ifood.md` §1), ou seja, só o CNPJ da própria Mobbs qualifica.

A boa notícia: isso já foi feito em 22/11/2026 — existe um app de teste **"Teste (C)"
(Centralized)** com um merchant de teste pré-vinculado automaticamente
(`merchantId 4fce20c8-d631-4bea-ab81-6d451dbb69a7`), usado para homologar a integração em
produção (ver `../HOMOLOGACAO-IFOOD-99FOOD-22-11-2026.md` §1). Não precisa criar nada novo.

**O que entregar ao QA:** as credenciais (`merchantId`/`clientId`/`clientSecret`) dessa loja de
teste, pra preencher em **Integrações → iFood** na retaguarda de homologação.

**Pendência de verificação:** gerar o pedido de teste (**Test orders → Generate test order**)
fica dentro do portal de desenvolvedor do iFood — a mesma conta/CNPJ de tecnologia da Mobbs, que
só você tem acesso hoje. Verificar se o portal permite convidar um colaborador/membro de equipe;
se não permitir, o caminho é você mesmo gerar o pedido de teste quando o QA pedir durante a
sessão (ele continua testando sozinho o resto: receber, confirmar, cancelar).

## 4. 99Food — depende de você

O `app_id`/`app_secret` é da Mobbs (plataforma), já separado em app de produção vs. app de teste
(`.env.hml` aponta pro de teste). Mas criar uma **loja de teste** dentro desse app só quem tem
acesso ao portal de desenvolvedor da Mobbs consegue fazer — diferente do iFood, o 99Food não vem
com nenhuma loja de teste pré-vinculada.

Isso também já foi feito uma vez: existe uma loja de teste **`bsdelivery-teste-01`**, criada via
**Gerenciamento de aplicativo → Ver detalhes do app → "Adicionar estabelecimento de teste"**
(só funciona em app tipo "Ambiente de teste" — ver `../HOMOLOGACAO-IFOOD-99FOOD-22-11-2026.md`
§2). Ela foi desvinculada do restaurante BsDelivery depois do teste de produção (pra não misturar
com o app real), então **precisa ser revinculada** no restaurante de teste do ambiente de
homologação antes de liberar pro QA — ou criar uma loja de teste nova, o processo é rápido.

**O que você faz antes:** revincular `bsdelivery-teste-01` (ou criar uma loja de teste nova) no
restaurante de teste da homologação.

**O que entregar ao QA:** nada de credencial direta — a vinculação já existe no restaurante.

**Pendência de verificação (mesma do iFood):** a **"Ferramenta de pedido de teste"** fica dentro
do portal de desenvolvedor da 99Food, na mesma conta que criou o app/loja de teste — só você tem
acesso hoje. Verificar se dá pra convidar o QA como colaborador; se não der, você gera o pedido
de teste quando ele pedir, e ele confirma na retaguarda **em até 5 minutos** (a 99Food cancela
automaticamente depois disso).

## 5. Fiscal (FocusNFe) — decisão: QA usa CNPJ e certificado próprios

Confirmado via documentação oficial da FocusNFe: **não existe um cadastro de homologação com
CNPJ fictício** — "ambiente de homologação" não é uma conta separada, é um **modo** dentro do
cadastro normal de empresa emitente, e cada empresa cadastrada (CNPJ + certificado A1 real)
recebe os dois tokens juntos (produção e homologação) automaticamente. Quem valida a assinatura
digital é a própria SEFAZ, mesmo em homologação — por isso o certificado precisa ser real.

Isso dá duas opções, e a decisão (confirmada com o usuário) foi pela **segunda**:

- **Opção A — reaproveitar a empresa que a Mobbs já tem cadastrada** (mesmo CNPJ/certificado já
  usados em produção): dependeria de você pegar o token de homologação no painel e repassar ao
  QA.
- **Opção B — QA cadastra a própria empresa emitente, com CNPJ e certificado A1 dele** ✅: cada
  cadastro de empresa na FocusNFe é independente/autocontido — ele se cadastra em
  [focusnfe.com.br](https://focusnfe.com.br/) com login próprio, registra a empresa com o CNPJ
  dele, sobe o certificado A1 dele, e recebe os dois tokens (produção e homologação) só pra
  aquela empresa — **sem nenhum vínculo com a conta da Mobbs**. Mesmo padrão de independência do
  Uber Entregas.

Passo a passo (QA, sozinho):

1. Cadastro em [focusnfe.com.br](https://focusnfe.com.br/) com CNPJ e certificado A1 próprios
   (ver `./focusnfe.md` §1).
2. Em **"Painel API" → "Tokens"**, pega o **token de homologação** (não o de produção).
3. Em **Integrações → Fiscal** na retaguarda de homologação, conecta com `environment:
   'homologacao'` + esse token + o CNPJ dele.
4. Entrega um pedido de teste — a emissão de NFCe dispara automaticamente (mesmo gatilho de
   produção), e o resultado aparece no sandbox da SEFAZ, sem validade fiscal real.

**Atenção:** esta é a única das 6 integrações que **nunca foi testada de ponta a ponta assim**
(só com certificado real + ambiente de produção) — o registro do webhook de confirmação também é
manual (`POST /v2/hooks` não é chamado automaticamente ao salvar a configuração, ver
`./focusnfe.md` §5). Vale o QA prestar atenção redobrada e reportar qualquer comportamento
inesperado.

**O que entregar ao QA:** nada — ele se cadastra e testa sozinho, do início ao fim.

## 6. Uber Entregas — QA pode se cadastrar sozinho

Correção importante: **não é 100% simulado sem credencial nenhuma** — `UBER_DIRECT_TEST_MODE=true`
(já é o padrão esperado no `.env` de homologação) só liga o `test_specifications` (Robo Courier,
modo "auto") nas chamadas reais à API da Uber — ainda é preciso credencial de verdade (sandbox)
por restaurante.

A boa notícia: diferente do iFood, aqui **não existe exigência de CNAE de tecnologia** — é uma
conta de negócio normal, vetting mais leve (ver `./uber-direct.md` §1). O QA consegue se cadastrar
sozinho em [developer.uber.com](https://developer.uber.com/), criar um app de teste, e preencher
`client_id`/`client_secret`/`customer_id`/CEP de origem em **Integrações → Uber Entregas** —
exatamente como um restaurante real faria.

**Não esquecer:** depois de conectado, a tela mostra a URL de webhook (com token embutido) — essa
URL precisa ser colada manualmente no painel de desenvolvedor da Uber, senão o status nunca
atualiza sozinho (achado real documentado em `./uber-direct.md` §4).

**O que entregar ao QA:** nada — ele se cadastra e testa sozinho, do início ao fim.
