# 99Food — conta, custo e como testar

Guia pra quem vai *usar* a integração, não pra quem vai mexer no código — pra isso, ver
[`../99FOOD.md`](../99FOOD.md) (webhook, `app_id`/`app_secret` da plataforma, 99 Entrega,
variáveis de ambiente).

## 0. Duas contas diferentes envolvidas

- **A Mobbs** (uma vez só): cadastra um **app de parceiro** no 99Food Open Platform — é essa
  credencial (`app_id`/`app_secret`) que fica no `.env` do BFF, nunca por restaurante.
- **Cada restaurante**: autoriza esse app a vincular **a loja dele já existente no 99Food**
  (self-service, pelo dono/gerente, direto na retaguarda) — a 99Food precisa que o restaurante
  **já exista** como parceiro vendedor na 99Food antes dessa vinculação (ver seção 1b).

## 1a. Criar o app de parceiro (feito uma vez, pela Mobbs)

1. Acesse o [99Food Open Platform](https://developer-food.99app.com/pt-BR/openapi) (menu
   "Documentos do desenvolvedor") e cadastre-se.
2. Em "Gerenciamento de aplicativo", registre uma aplicação — o portal devolve `app_id` e
   `app_secret`.
3. Registre a URL do webhook (`https://<host-do-bff>/webhooks/99food`) na configuração da
   aplicação — **não há endpoint de auto-registro**, é um passo manual dentro do portal.

**Sem cadastro oficial de "programa de desenvolvedor" publicamente documentado** fora desse
portal — não encontrei confirmação pública de que o acesso ao Open Platform tenha custo; o
modelo de negócio da 99Food (como qualquer marketplace de delivery) monetiza via comissão do
**restaurante**, não cobrando do fornecedor de software — mas vale confirmar diretamente com o
time de parceiros da 99Food antes de assumir.

## 1b. Cada restaurante precisa já ser parceiro 99Food

Isso é **separado** da integração técnica — o restaurante precisa primeiro existir como
vendedor na 99Food (cadastro próprio deles, fora do mobbs), com CNPJ válido, cardápio e dados
bancários configurados **no painel deles**. Só depois disso a vinculação pela retaguarda do
mobbs funciona.

## 2. Quem paga o quê

- **Acesso ao Open Platform (Mobbs)**: sem confirmação pública de custo — ver nota acima.
- **Comissão por pedido (do restaurante)**: cobrada pela 99Food diretamente do repasse, fora do
  nosso sistema. Conferido em 02/11/2026 (confirme direto no painel do parceiro, condições
  promocionais mudam):
  - **~8,9%** sobre o valor do pedido quando a entrega é feita pela logística própria da 99Food.
  - **~10,9%** quando o restaurante faz a entrega por conta própria.
  - A 99Food já anunciou períodos promocionais de isenção total de comissão/mensalidade pra
    atrair restaurantes (12 a 24 meses, segundo fontes divergentes) — relatos de restaurantes
    cobrando descontos de logística não previstos durante esse período. **Confira as condições
    vigentes direto no painel do parceiro** antes de decidir.

## 3. Sandbox — não documentado publicamente

Diferente do iFood/Uber/Mercado Pago, a 99Food **não documenta um ambiente de testes separado**
da produção (`NINETY_NINE_FOOD_BASE_URL` só mudaria se a 99Food fornecesse uma URL de testes —
nenhuma foi encontrada até agora). Na prática, isso significa:

1. Pra testar de ponta a ponta, você precisa de uma loja real (ou uma loja de testes cadastrada
   como parceiro de verdade na 99Food) vinculada via **Integrações → 99Food** na retaguarda.
2. Gere um pedido real pequeno nesse restaurante de teste (menor valor possível) e confirme que
   ele chega na retaguarda via webhook (`orderNew`), com a etiqueta "99Food".
3. Confirme o pedido pela retaguarda **em até 5 minutos** (a 99Food cancela automaticamente
   depois disso) e confira que a confirmação chegou do lado da 99Food também.

Se a 99Food tiver uma conta de homologação/sandbox não documentada publicamente, vale perguntar
diretamente ao time de parceiros deles ao abrir o cadastro — não assuma que não existe só porque
não está na documentação pública.

## 4. Limitação de design conhecida (vinculação por ordem de chegada)

A 99Food não deixa escolher **qual** restaurante nosso corresponde à autorização no momento de
gerar o link — o casamento é feito pela ordem: o primeiro a gerar o link é o primeiro vinculado
quando a autorização chegar. **Evite ter dois donos gerando o link ao mesmo tempo** — pode
vincular a loja errada.

## 5. Status real (ver `specs/0122-integracao-99food`)

Estrutura completa (vínculo self-service, recebimento de pedido, confirmação/cancelamento, 99
Entrega), mas **sem homologação real** — nenhuma loja de verdade foi conectada ainda. Esse é o
próximo passo, junto da confirmação de custo do Open Platform (seção 2).
