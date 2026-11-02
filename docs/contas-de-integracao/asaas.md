# Asaas (Pix dos pedidos) — conta, custo e como testar

Guia pra quem vai *usar* a integração, não pra quem vai mexer no código. Não existe um
`ASAAS.md` técnico próprio ainda — o contrato está documentado direto no código
(`src/modules/payments-asaas/`, `shared/config/environment.ts` linhas 39-48) e em
`specs/0101-integracao-asaas`.

**Não confundir com `CHECKLIST-ATIVACAO-COBRANCA-ASSINATURA.md`** — aquele é sobre o Asaas
cobrando a ASSINATURA da Mobbs de cada restaurante (specs/0175); este aqui é sobre o Asaas
cobrando o **Pix dos pedidos dos clientes** de cada restaurante (specs/0101). Os dois reusam a
MESMA chave de API da conta mãe (`ASAAS_API_KEY`), mas são funcionalidades completamente
diferentes.

## 0. Modelo diferente de todas as outras integrações

Aqui **não existe conta de desenvolvedor por restaurante** — é o oposto do iFood/Uber/99Food. A
Mobbs tem UMA conta Asaas própria (a "conta mãe"), e quando um restaurante conecta **Integrações
→ Asaas** na retaguarda (preenchendo nome, e-mail, CPF/CNPJ, data de nascimento, celular,
faturamento mensal e endereço — nenhuma credencial técnica, só dados cadastrais), o BFF chama o
Asaas em nome da Mobbs (`POST /v3/accounts`) e **cria uma subconta pro restaurante**
automaticamente. O restaurante nunca precisa abrir conta no Asaas sozinho nem gerar chave
nenhuma — tudo acontece dentro da retaguarda.

## 1. Criar a conta mãe (feito uma vez, pela Mobbs)

1. Abra uma conta Asaas normal (PJ) em [asaas.com](https://www.asaas.com/) — sem custo de
   abertura nem mensalidade, confirmado na página oficial de preços: você só paga quando usa
   (recebe uma cobrança, emite uma fatura, antecipa um recebível, etc).
2. No painel, gere a **API Key** da conta — vai em `ASAAS_API_KEY` no `.env` do BFF.
3. **Importante**: criar subcontas via API simples (`POST /v3/accounts`, o que o código já faz)
   funciona sem aprovação prévia, mas gera subcontas no formato **padrão** (o restaurante teria
   acesso próprio à interface do Asaas, se quisesse). Pra ter o modelo **white label** de verdade
   (subconta sem nenhuma marca Asaas visível, limites maiores), é preciso alinhar antes com um
   gerente de contas Asaas — não é um toggle de autoatendimento.

## 2. Quem paga o quê

- **Abrir/manter a conta mãe**: grátis, sem mensalidade.
- **Por recebimento (Pix)**: o Asaas desconta uma taxa automaticamente de cada Pix recebido,
  direto da subconta do restaurante — não passa pela Mobbs. Não encontrei uma tabela oficial de
  taxas específica pra subcontas/white label (varia por volume e modelo negociado) — confira
  direto com o Asaas ou no painel da conta mãe antes de divulgar um valor pro restaurante.
- Nenhuma comissão/split é cobrado pela Mobbs nesta implementação — é passagem direta restaurante
  ↔ Asaas.

## 3. Sandbox — já é o padrão do sistema

Essa é a integração mais simples de testar das 6: **o sandbox já é o valor padrão do código**.

```ts
baseUrl: process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3'
```

Se você nunca configurar `ASAAS_BASE_URL`, o BFF já conversa com o sandbox do Asaas sozinho —
só precisa de uma `ASAAS_API_KEY` de uma conta de **sandbox** (criação instantânea, sem
aprovação, no mesmo cadastro de desenvolvedor do Asaas).

1. Configure `ASAAS_API_KEY` com a chave da conta sandbox (deixe `ASAAS_BASE_URL` sem definir).
2. Conecte um restaurante de teste em **Integrações → Asaas**.
3. Faça um pedido Pix nesse restaurante — o Pix já é cobrado de verdade pelo Asaas (ambiente de
   testes), e o **webhook de confirmação é registrado automaticamente** na criação da subconta
   (`createSubaccount`, não precisa cadastrar nada manualmente no painel do Asaas, diferente de
   FocusNFe/99Food/Mercado Pago).
4. Confirme que o pedido muda de status sozinho quando o Pix de teste é "pago" pelo simulador do
   sandbox Asaas.

## 4. Indo pra produção

Defina `ASAAS_BASE_URL=https://api.asaas.com/v3` e troque `ASAAS_API_KEY` pela chave da conta
mãe de **produção** real. Nenhuma mudança de código — é só variável de ambiente.

## 5. Limitações conhecidas

- Fase 1 só cobre **Pix**; cartão/boleto por essa via ficaram pra uma fase 2 (ver fase 2
  `CHECKOUT_PAID` já parcialmente presente no webhook, mas não exposto na UI de conexão).
- O Asaas **não permite excluir subconta por API** — "Vincular outra conta" na tela não apaga a
  antiga, só arquiva (`previousAsaasSubaccounts`) e permite reconectar depois.
- Tela de "Repasses Asaas" (`/asaas-balance`) mostra o saldo da subconta — ver
  `AsaasBalancePage.tsx` pro que exatamente é exibido.
