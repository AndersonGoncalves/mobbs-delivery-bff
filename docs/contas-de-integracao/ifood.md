# iFood — conta, custo e como testar

Guia pra quem vai *usar* a integração (dono da plataforma), não pra quem vai mexer no código —
pra isso, ver [`../IFOOD.md`](../IFOOD.md) (como o BFF consome a API, polling, webhook de
confirmação, variáveis de ambiente).

## 1. Criar a conta de desenvolvedor

1. Acesse [developer.ifood.com.br](https://developer.ifood.com.br/) e cadastre-se.
2. Precisa de **CNPJ com CNAE de tecnologia** — CPF não serve, e um CNPJ de restaurante comum
   também não (precisa ser o CNPJ de quem desenvolve/fornece o software, no caso a Mobbs).
3. O cadastro em si **é gratuito**. Ao concluir, o portal já libera automaticamente uma **loja de
   teste + um app de teste** — não precisa pedir nada à parte pra ter acesso ao sandbox.
4. Dentro do portal, crie um app — ele devolve `clientId`/`clientSecret` (os mesmos campos que a
   tela **Integrações → iFood** da retaguarda pede) e um `merchantId` da loja de teste.

## 2. Quem paga o quê

- **Acesso à plataforma de desenvolvedor**: grátis, sem mensalidade pra Mobbs nem pro
  restaurante.
- **Comissão por pedido**: é o iFood quem cobra essa comissão do restaurante diretamente, pelo
  canal normal de vendas dele no marketplace — não é algo que passa pelo nosso sistema, e o
  percentual varia por plano comercial do restaurante com o iFood (fora do nosso controle).

## 3. Sandbox — como testar sem homologação aprovada

Não existe uma URL diferente nem um "modo sandbox" no código: o ambiente de testes do iFood é a
**mesma API**, só que usando as credenciais (`clientId`/`clientSecret`/`merchantId`) da **loja de
teste** que o portal já te deu de graça no cadastro. Ou seja:

1. Preencha a tela **Integrações → iFood** da retaguarda com as credenciais da loja de teste.
2. Use o próprio portal do iFood (ou o painel da loja de teste) pra simular um pedido novo.
3. O BFF faz *polling* a cada ~30s — o pedido simulado deve aparecer na lista normal de pedidos
   da retaguarda, com a etiqueta "iFood", dentro desse intervalo.
4. Confirme/cancele o pedido pela retaguarda e confira que a ação é refletida de volta no iFood
   (loja de teste).

## 4. Indo pra produção (homologação)

Depois de validar no sandbox, dentro do próprio portal do iFood você solicita a
**"homologação"** — uma revisão/certificação da integração, feita pelo time do iFood, que só o
dono da conta no portal consegue iniciar. Esse processo:

- É inteiramente do lado do iFood, fora do nosso controle (prazo variável).
- Depois de aprovada a homologação do app, **cada loja real** que for conectar ainda precisa
  aprovar a vinculação do lado dela (dono/gerente do restaurante autoriza o app na própria conta
  deles no iFood).

**Status real nesta implementação** (ver `specs/0090-integracao-ifood`): a estrutura está pronta
e funcional, mas **nenhuma homologação real foi feita ainda** — é o próximo passo antes de usar
com uma loja de verdade.
