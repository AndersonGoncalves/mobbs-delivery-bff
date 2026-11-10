# Uber Entregas (Uber Direct) — conta, custo e como testar

Guia pra quem vai *usar* a integração (dono da plataforma/restaurante), não pra quem vai mexer
no código — pra isso, ver [`../UBER-DIRECT.md`](../UBER-DIRECT.md) (como o BFF chama a API de
cotação/criação de entrega, webhook de status, variáveis de ambiente).

## 1. Criar a conta de desenvolvedor

1. Acesse [developer.uber.com](https://developer.uber.com/) e cadastre uma conta de negócio
   vinculada ao **Uber Direct**.
2. Diferente do iFood, aqui não existe um "CNAE de tecnologia" exigido — é uma conta de negócio
   normal, vinculada ao Uber Direct especificamente (vetting mais leve que o do iFood).
3. No painel, aba "Developer", você encontra o `customer_id` do negócio.
4. Registre um app pra obter `client_id`/`client_secret` — os mesmos 3 campos (+ `originZipCode`,
   o CEP de origem das entregas) que a tela **Integrações → Uber Entregas** da retaguarda pede.

## 2. Quem paga o quê

- **Acesso à plataforma de desenvolvedor**: **sem taxa de assinatura/mensalidade** — confirmado
  nos próprios termos do Uber Direct.
- **Por entrega**: você paga só quando efetivamente despacha uma entrega, e o valor vem
  **dinâmico na própria cotação** (varia por distância/demanda) — não é um valor fixo cadastrado
  em lugar nenhum.

## 3. Sandbox — como testar

O Uber Direct tem um sandbox de verdade, **separado da produção**: registrando um app de teste
no painel de desenvolvedor, você recebe um `client_id`/`client_secret`/`customer_id` de teste.
Cotações e entregas criadas com essas credenciais são simuladas — nenhum entregador real sai,
nenhuma cobrança acontece.

1. Preencha **Integrações → Uber Entregas** com as credenciais de teste.
2. Num pedido de delivery já confirmado, em preparo e sem motoboy próprio, clique
   **"Despachar via Uber Entregas"**.
3. A cotação/criação da entrega acontece numa única ação; o status (chip no card do pedido)
   deveria atualizar sozinho via webhook conforme a entrega simulada "avança".

## 4. URL do webhook — cole no painel da Uber

A configuração gera um **token de webhook** automaticamente ao salvar (pra autenticar as
chamadas que o Uber manda de volta pra nós). **Integrações → Uber Entregas**, já conectado,
mostra a URL completa (com o token embutido) e um botão "Copiar" — cole essa URL na configuração
de webhook do app, no painel de desenvolvedor da Uber. Sem isso, você consegue despachar uma
entrega de teste, mas o status nunca muda sozinho (nenhum webhook chega).

*(Achado real de 10/11/2026 — antes dessa correção, a tela nunca mostrava esse token/URL em
lugar nenhum, o que deixava o teste de despacho impossível de completar.)*

## 5. Limitações conhecidas (ver `specs/0121-integracao-uber-entregas`)

- `Order.deliveryAddress` é texto livre, sem endereço estruturado/lat-long — a cotação usa uma
  aproximação de cidade/UF a partir do cadastro do restaurante, o que pode gerar cotações
  imprecisas ou recusadas até o sistema ter endereço estruturado de cliente.
- Cancelamento de uma entrega já despachada não é feito pelo operador — o status é 100%
  dirigido por webhook, sem rota de cancelamento manual implementada.
- O webhook usa um token simples por query string (`?token=...`), não verificação HMAC de
  assinatura — simplificação deliberada da v1, documentada em `UBER-DIRECT.md` §5.
