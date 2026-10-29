# Checklist de ativação — cobrança da assinatura da plataforma (specs/0175)

Este documento cobre o **rollout controlado** da cobrança real da assinatura (REQ-36): validar em
sandbox antes de produção, configurar o ambiente e saber monitorar depois. Não cobre a integração
de pagamento dos PEDIDOS dos restaurantes (`specs/0101`/`specs/0170`, documentação própria) — aqui
é só a assinatura que o LOJISTA paga à plataforma.

## 1. Pré-requisitos

- Conta Asaas da **plataforma** (conta mãe) já existente — a mesma usada hoje em
  `ASAAS_API_KEY`/`ASAAS_BASE_URL` (specs/0101) pra criar subcontas. A cobrança da assinatura usa
  essa MESMA credencial, como uso novo da mesma conta (cliente/cobrança próprios, não subconta).
- Chave Pix real da plataforma (CPF do titular da conta), pra referência do recebedor na tela de
  pagamento (nunca usada pra gerar Pix estático — o Pix é sempre dinâmico, via API).

## 2. Variáveis de ambiente novas (`.env` privado do BFF)

```
BILLING_PIX_KEY_TYPE=CPF
BILLING_PIX_KEY=<CPF do titular, só no ambiente privado>
BILLING_PIX_BENEFICIARY_NAME=<nome do titular>
ASAAS_BILLING_WEBHOOK_TOKEN=<gerar com: openssl rand -hex 24>
```

`ASAAS_BILLING_WEBHOOK_TOKEN` é um segredo **próprio**, nunca o mesmo de `ASAAS_API_KEY` nem dos
tokens por-restaurante de `specs/0101`/`specs/0170`. Registrar no Asaas um webhook apontando pra:

```
https://<BFF_PUBLIC_BASE_URL>/webhooks/platform-billing
```

com esse token no header `asaas-access-token`, pros eventos `PAYMENT_CONFIRMED`,
`PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED` (mínimo — outros eventos relacionados a
pagamento não fazem o BFF reagir, mas não precisam ser removidos da lista do Asaas).

## 3. Sandbox primeiro

Com `ASAAS_BASE_URL` apontando pra sandbox (padrão já existente), confirmar manualmente, antes de
qualquer deploy em produção:

- [ ] `POST /restaurants/me/billing/payer` cadastra o pagador de verdade na sandbox Asaas
      (`AsaasClient.createCustomer`, conta mãe).
- [ ] Emissão: um restaurante com faturamento numa faixa paga, depois do fechamento mensal (ou do
      sweep disparado no boot), recebe uma obligation `pending` com `pixPayload` real.
- [ ] Pagamento: pagar o Pix (sandbox) e confirmar que o webhook (`POST
      /webhooks/platform-billing`) chega e marca a obligation como `paid`, liberando o acesso na
      hora (sem esperar o próximo ciclo).
- [ ] Reconciliação: "Verificar pagamento" (`POST .../invoices/:id/verify`) também confirma,
      mesmo simulando o webhook não ter chegado.
- [ ] Bloqueio/liberação: um restaurante com obligation vencida (sem pagar) bloqueia a retaguarda
      (`billing_blocked`) e libera automaticamente ao pagar.

## 4. Ativação em produção

1. Trocar `ASAAS_BASE_URL` pra produção (mesma troca já usada por `specs/0101`/`specs/0170` — não
   há passo adicional específico desta spec).
2. Subir o deploy com as 4 variáveis novas preenchidas. A migração `activatePlatformBilling`
   (`src/modules/platform-billing/infra/migrations/activate-platform-billing.ts`) roda
   automaticamente no primeiro boot: grava o MÊS DE ATIVAÇÃO (nunca cobra competências
   anteriores, REQ-34) e a versão 1 da configuração de preços/limites vigente.
3. Comunicar os lojistas existentes **antes** da primeira cobrança real (a primeira competência
   cobrada é a do mês de ativação, emitida no mês seguinte — ex. ativar em outubro só gera
   cobrança em novembro, referente a outubro).
4. Restaurante com `cycle: 'annual'` legado (anterior a esta spec, sem `IAnnualSubscription`
   real) aparece como pendência (`hasLegacyAnnualConflict`) no painel administrativo
   (`/plataforma`, "Ver cobrança") — **nunca** é convertido automaticamente; conferir manualmente
   se cada um desses restaurantes já tinha de fato uma adesão anual válida antes de decidir o que
   fazer (nenhuma ação automática resolve isso).

## 5. Operação/monitoramento

- O ciclo (`PlatformBillingCycleService.runCycle`) roda uma vez no boot do BFF **e também a cada 5
  minutos** (`setInterval` em `main.ts`, adicionado em 2026-10-29 — achado real: uma obligation
  criada depois do sweep do boot ficava `awaiting_issue` pra sempre até o processo reiniciar,
  nenhum Pix era emitido). Fire-and-forget em ambos os casos, erro só logado — nunca derruba o
  servidor. Sem cron externo necessário agora; o endpoint administrativo de reprocessamento
  (`POST /platform/billing/restaurants/:id/reprocess`) continua disponível pra forçar uma
  emissão específica sem esperar os 5 minutos.
- Falha de emissão (`issue_failed`) aparece como "Falha de emissão" no painel administrativo
  (`/plataforma`) e no aviso da retaguarda do próprio restaurante — nunca silenciosa.
- Nunca logar `BILLING_PIX_KEY`/`ASAAS_BILLING_WEBHOOK_TOKEN`/documentos completos de pagador.
