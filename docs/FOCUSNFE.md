# FocusNFe — emissão fiscal (NFCe)

`specs/0091-integracao-fiscal-focusnfe`. A FocusNFe é terceirizadora de emissão fiscal: o
restaurante não emite direto na SEFAZ, a FocusNFe faz esse trabalho. O cadastro fiscal em si
(CNPJ, regime tributário, certificado digital A1) é feito no painel da própria FocusNFe, fora do
nosso sistema — o BFF só usa o token de API depois disso.

> **Status desta v1**: estrutura completa (config, modelo de dados, cliente HTTP, webhook,
> telas, reemissão/cancelamento), mas **sem homologação real** — não há conta de testes da
> FocusNFe disponível nesta sessão de implementação. Documento fiscal implementado: **NFCe**
> (modelo 65) apenas; `documentType: 'cfe'|'nfe'` já existem no cadastro (dependem do regime
> tributário/UF de cada restaurante, decisão fiscal, não do software) mas **lançam erro
> explícito** se escolhidos (`FocusNfeApiClient.emitCfe`/`emitNfe`) — implementação futura.

## 1. Cadastro na FocusNFe (feito pelo restaurante, fora do mobbs)

1. O restaurante cria/configura a conta na FocusNFe (CNPJ, regime tributário, certificado
   digital A1).
2. A FocusNFe devolve um **token de API** (usuário em HTTP Basic Auth, senha vazia — conferido
   em `doc.focusnfe.com.br/reference/autenticacao`).

## 2. Conectar na retaguarda (dono/gerente)

1. Abra **Integrações → Fiscal** em `https://bsdelivery.com.br/painel`.
2. Preencha token, CNPJ do emitente, ambiente (homologação/produção) e documento fiscal (NFCe).
3. Salve — a tela passa a mostrar "Conectado".
4. **Risco real, não só bug de software** (ver `spec.md`/`plan.md`, "Riscos e alternativas
   consideradas"): emissão fiscal errada (documento no regime errado, campos incompletos) é
   problema tributário de verdade pro restaurante. Por isso, mesmo com `environment: 'producao'`
   configurado, a emissão automática só dispara depois que o operador testar com sucesso em
   homologação e **ligar manualmente** o botão "Ativar produção" — uma ação deliberadamente
   separada do formulário de conexão.

## 3. Como funciona a emissão

- Gatilho: pedido chega ao status **"entregue"** (`OrdersController`, mesmo ponto onde o
  WhatsApp de atualização de status já é disparado) — nunca na confirmação, pra evitar nota de
  pedido ainda cancelável.
- Pedido cancelado **antes** de ter nota emitida nunca gera nota (REQ-6).
- A emissão de NFCe é **síncrona** — autorizada ou rejeitada na mesma chamada
  (`doc.focusnfe.com.br/reference/emitir_nfce`); se a FocusNFe devolver
  `processando_autorizacao` (caso assíncrono), o resultado final chega pelo webhook.
- Rejeição (SEFAZ ou erro de API) grava `Order.fiscal.status = 'rejeitado'` com o motivo —
  **nunca trava o resto do fluxo do pedido** (REQ-4). O operador reemite manualmente pela
  retaguarda (seção fiscal no card do pedido).
- Nota emitida ganha um botão de "Solicitar cancelamento da nota" (REQ-6) — a FocusNFe só aceita
  cancelamento em até 30 minutos após a emissão.

## 4. Webhook

`POST /webhooks/focusnfe/:restaurantId` — mesmo padrão de `AsaasWebhookController`
(`POST /webhooks/asaas/:restaurantId`): o restaurante vem no path, autenticação é "o header bate
com o token deste restaurante" (`FiscalConfig.webhookToken`, gerado automaticamente na criação
da config — nunca digitado pelo operador), sem Firebase nem operador logado.

Header usado: `focusnfe-webhook-token` (nome escolhido por nós — a FocusNFe permite configurar o
nome do header e o valor enviado ao registrar o webhook, `POST /v2/hooks`, campos
`authorization`/`authorization_header`).

**Suposição não confirmada**: a doc pública da FocusNFe (`doc.focusnfe.com.br/docs/webhooks`)
não publica o schema exato do payload de notificação — só diz que a notificação de autorização
"contém os mesmos dados da consulta GET do documento". `FocusNfeWebhookPayload` (em
`focus-nfe-client.ts`) assume esse mesmo formato (`ref`, `status`, `mensagem_sefaz`,
`caminho_danfe`, etc.). **Registro do webhook na FocusNFe (`POST /v2/hooks`) é um passo manual
nesta v1** — `FocusNfeApiClient.registerWebhook` já existe pronto para uso, mas não é chamado
automaticamente ao salvar a configuração (ninguém testou isso contra a API real ainda).

## 5. Suposições assumidas no payload de emissão (a confirmar com o contador do restaurante)

A spec (`spec.md`, "Fora de escopo") deliberadamente evita campos fiscais novos por produto além
do que já existe (`Product.ncmCode`, `specs/0116`) — os valores abaixo são **genéricos**, usados
quando não há informação mais específica:

| Campo FocusNFe | Valor usado | Observação |
|---|---|---|
| `codigo_ncm` | `Product.ncmCode`, ou `21069090` se ausente | NCM genérico de miscelânea |
| `cfop` | `5102` | venda dentro do estado — não calcula UF real do cliente |
| `icms_situacao_tributaria` | `102` | assume Simples Nacional sem permissão de crédito |
| `icms_origem` | `0` | nacional |
| `unidade_comercial`/`unidade_tributavel` | `UN` | catálogo não tem campo de unidade |
| `presenca_comprador` | `1` (presencial) | convenção usada mesmo para delivery/app |
| `modalidade_frete` | `9` (sem transporte formal) | entrega por motoboy próprio/app |
| `local_destino` | `1` (operação interna) | não verifica UF real do destinatário |
| forma de pagamento (Pix) | `17` | código menos confirmado — checar doc completa antes de ativar produção |

Nenhum desses é configurável ainda. Se o regime tributário real do restaurante-piloto precisar
de valores diferentes (CFOP interestadual, CST/CSOSN de outro regime), `FiscalEmissionService`
(`domain/services/fiscal-emission.service.ts`) é o único lugar que precisa mudar.

## 6. Variáveis de ambiente

Nenhuma nova. Diferente do iFood (`IFOOD_BASE_URL`), as duas URLs da FocusNFe são fixas por
ambiente e resolvidas a partir de `FiscalConfig.environment` (não de `process.env`):

```text
homologação: https://homologacao.focusnfe.com.br
produção:    https://api.focusnfe.com.br
```

## Fora de escopo (v1)

- Emissão de CFe/SAT e NFe modelo 55 — `documentType` já aceita a escolha no cadastro, mas a
  chamada lança erro explícito até ganhar implementação própria.
- Rateio fiscal fino por produto (CST/CFOP específicos) — usa valores genéricos (seção 5).
- Registro automático do webhook na FocusNFe (`POST /v2/hooks`) ao salvar a configuração — passo
  manual nesta v1.
- Conciliação financeira do que a FocusNFe cobra pela emissão.

Ver `specs/0091-integracao-fiscal-focusnfe/spec.md` pra lista completa.
