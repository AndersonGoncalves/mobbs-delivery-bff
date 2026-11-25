# Contas de integração — conta, custo e como testar

Ajuste explícito do usuário (02/11/2026) — cada integração externa já tinha um guia técnico
("como o código conversa com a API", ver `../IFOOD.md`/`../UBER-DIRECT.md`/`../FOCUSNFE.md`/
`../MERCADO-PAGO.md`/`../99FOOD.md`), mas faltava o guia do outro lado: como criar a conta, quem
paga, se tem sandbox e como validar de ponta a ponta antes de ligar pra uma loja real. Cada
arquivo aqui cobre exatamente isso, pra uma integração:

- [iFood](./ifood.md)
- [Uber Entregas (Uber Direct)](./uber-direct.md)
- [FocusNFe (fiscal)](./focusnfe.md)
- [Mercado Pago](./mercado-pago.md)
  - [Mercado Pago — homologação e produção (estado, passos e pendências)](./mercado-pago-hml-producao.md)
- [99Food](./99food.md)
- [Asaas (Pix dos pedidos)](./asaas.md) — **desativado nos pedidos desde 24/11/2026**; o Asaas fica só com a mensalidade da plataforma
- [Inventário de contas e credenciais da homologação](./inventario-homologacao.md) — o que existe, de quem é, onde está a credencial e o que revogar no fim do teste do QA

Nenhuma das 6 integrações foi homologada contra uma conta real de produção ainda — todas estão
com a estrutura de código completa, testadas localmente com mocks/sandbox apenas. Ver cada
arquivo pra detalhes específicos e pendências.

Pra quem vai preparar o ambiente de homologação pro QA testar as 6 integrações, ver
[Preparar as 6 integrações pro QA](./homologacao-qa.md) — resumo de quem precisa cadastrar o quê
antes, e se o QA consegue se cadastrar sozinho (como um cliente real) ou depende de uma ação sua
primeiro.
