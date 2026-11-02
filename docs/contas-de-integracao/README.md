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
- [99Food](./99food.md)
- [Asaas (Pix dos pedidos)](./asaas.md)

Nenhuma das 6 integrações foi homologada contra uma conta real de produção ainda — todas estão
com a estrutura de código completa, testadas localmente com mocks/sandbox apenas. Ver cada
arquivo pra detalhes específicos e pendências.
