# FocusNFe — conta, custo e como testar

Guia pra quem vai *usar* a integração, não pra quem vai mexer no código — pra isso, ver
[`../FOCUSNFE.md`](../FOCUSNFE.md) (payload de emissão, webhook, status do pedido, variáveis).

## 0. O que é diferente aqui

A FocusNFe **não é um canal de vendas nem um marketplace** como iFood/Uber/99Food — é uma
terceirizadora de emissão fiscal: ela conversa com a SEFAZ no lugar do restaurante pra emitir a
nota (NFCe) de cada venda. **Quem precisa da conta é o restaurante**, não a Mobbs — é uma
obrigação fiscal dele, que existiria mesmo sem o mobbs.

## 1. Criar a conta (feito pelo restaurante, fora do mobbs)

1. O restaurante cria/configura a conta em [focusnfe.com.br](https://focusnfe.com.br/) com seu
   próprio CNPJ, regime tributário e **certificado digital A1** (certificado da empresa, também
   obrigação fiscal própria, não algo que a Mobbs fornece).
2. A FocusNFe devolve um **token de API** — é esse token (não usuário/senha) que vai na tela
   **Integrações → Fiscal** da retaguarda, junto com o CNPJ do emitente.

## 2. Quem paga o quê

A FocusNFe cobra do restaurante por plano mensal com uma cota de documentos emitidos, mais um
valor por documento excedente. Conferido na própria página de preços deles
([focusnfe.com.br/precos](https://focusnfe.com.br/precos/)) em 02/11/2026 — **confirme lá antes
de decidir**, preços de SaaS mudam:

| Plano | Mensalidade | O que inclui |
|---|---|---|
| Retail (NFCe) | R$ 59,90/mês | 500 NFCe + 100 NFe; excedente R$ 0,05/NFCe |
| Retail+ (NFCe) | R$ 629,90/mês | 9.000 NFCe + 1.000 NFe; excedente R$ 0,06/NFCe |
| Solo | R$ 89,90/mês | 1 CNPJ, documentos variados |

A FocusNFe anuncia **30 dias de teste grátis** nos planos Retail, sem taxa de setup.

## 3. Sandbox — já está pronto no código, é só usar

Diferente do iFood/Uber, aqui **não precisa de credencial de teste separada** — o campo
"ambiente" na tela de conexão já alterna entre as duas URLs oficiais da FocusNFe:

```text
homologação: https://homologacao.focusnfe.com.br
produção:    https://api.focusnfe.com.br
```

1. Crie também uma conta/certificado de **homologação** na FocusNFe (processo similar ao de
   produção, mas sem validade fiscal real).
2. Conecte na retaguarda com `environment: 'homologacao'`.
3. Entregue um pedido de teste — a emissão de NFCe dispara automaticamente nesse status (mesmo
   gatilho de produção), e você vê o resultado (autorizada/rejeitada) direto no card do pedido.

## 4. Indo pra produção — trava deliberada, não só burocracia

Emissão fiscal errada é problema tributário real pro restaurante, não só bug de software. Por
isso, **mesmo com `environment: 'producao'` configurado**, a emissão automática só começa a
valer depois que o operador testar com sucesso em homologação **e** ligar manualmente o botão
**"Ativar produção"** — uma ação deliberadamente separada do formulário de conexão, pra nunca
emitir nota real sem alguém ter testado antes.

## 5. Pendências conhecidas (ver `specs/0091-integracao-fiscal-focusnfe`)

- **Nenhuma homologação real foi testada** nesta implementação — não havia conta de testes da
  FocusNFe disponível durante o desenvolvimento.
- O registro do webhook de confirmação (`POST /v2/hooks`) na FocusNFe é **manual** — o código já
  sabe fazer essa chamada (`FocusNfeApiClient.registerWebhook`), mas ninguém chama
  automaticamente ao salvar a configuração ainda.
- Só **NFCe** (modelo 65) está implementado de verdade; CFe/NFe modelo 55 lançam erro explícito
  se escolhidos — dependem do regime tributário/UF de cada restaurante, decisão que cabe ao
  contador dele, não ao software.
- Os valores fiscais genéricos (CFOP, CST, NCM padrão quando o produto não tem um cadastrado)
  foram assumidos sem confirmação de um contador — ver tabela completa em `FOCUSNFE.md` §5,
  revisar antes de ativar produção de verdade com uma loja real.
