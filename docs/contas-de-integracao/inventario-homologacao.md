# Inventário de contas e credenciais — homologação

`specs/0215-ambiente-homologacao` T024 (25/11/2026). Lista **o que existe, de quem é, onde está a
credencial e quem tem acesso** em cada integração da homologação, para saber o que revogar quando o
QA terminar. Complementa o `homologacao-qa.md` (quem cadastra o quê) — **este arquivo nunca guarda
segredo**: só diz onde ele está.

## Regras

1. **Homologação nunca usa credencial de produção.** Cada integração tem conta ou aplicação de
   teste própria.
2. **Credencial de plataforma é do dono do sistema.** Fica no `.envs/.env.hml` (BFF) e no gerenciador
   de senhas, pasta "BsDelivery – Homologação". O QA não recebe: testa pela retaguarda e pelo app,
   e vê os logs pelo SSH só de leitura.
3. **Acesso do QA a painel é por convite, com login próprio** (menus "Usuários"/"Colaboradores"),
   nunca com a senha do dono. Assim dá para revogar no fim.
4. **E-mails das contas de teste** com sufixo no Gmail do dono (`<email>+<servico>-hml@gmail.com`):
   tudo chega na mesma caixa, cada serviço vê uma conta diferente.
5. **O que é do QA** (logins de contas de teste, credenciais da loja iFood de teste) vai **em
   separado** do roteiro — ver `publicar-hml/MENSAGEM-QA.md` (repositório do app).

## Plataforma (ficam com o dono, no `.env.hml`)

| Integração | Conta / aplicação | Login (dono) | Onde está a credencial | Acesso do QA | Situação | No fim do teste |
|---|---|---|---|---|---|---|
| Mercado Pago | Aplicação **"BsDelivery Homologacao"** (nº 4990864883314933), criada **dentro** da conta de teste "BsDelivery Homologacao" (ex-"Seller Test User") (`specs/0215` T021, caminho B) | Conta de teste "BsDelivery Homologacao" (TESTUSER5830…) | `.env.hml`: `MERCADOPAGO_CLIENT_ID`/`CLIENT_SECRET`/`WEBHOOK_SECRET`, `TEST_TOKEN=false` | Não precisa do portal; se precisar, "Convidar colaboradores" | **Existe** (26/11/2026; cartão e Pix comprovados) | Nada a revogar (conta de teste) |
| Mercado Pago | Contas de teste (nomes de 26/11/2026): BsDelivery Homologacao (3874968670, plataforma), Pizzaria teste (3874969016), Hamburgueria teste (3880877540), Pastelaria teste (3880801736), Cliente teste (3874969014), Cliente teste 2 (3874757368) | Portal Developers → Contas de teste | Senhas no portal (Contas de teste) e no gerenciador | **Recebe** os logins de "Cliente teste" e "Cliente teste 2"; das contas de restaurante só se for testar Desvincular/Vincular; **nunca** a "BsDelivery Homologacao" | Existem | Gerar senha nova das contas entregues |
| Asaas (mensalidade da plataforma) | Conta **sandbox** (sandbox.asaas.com) | Dono | `.env.hml`: `ASAAS_API_KEY`, `ASAAS_BASE_URL` (sandbox), `ASAAS_BILLING_WEBHOOK_TOKEN` — **diferentes** dos de produção (conferido em 25/11/2026) | Só se for testar a mensalidade: **convidar como usuário** da conta sandbox, para confirmar pagamentos de teste (hoje o `homologacao-qa.md` tira o Asaas do escopo do QA) | Existe | Remover o usuário do QA |
| 99Food | App de teste (outro App ID/Secret que o de produção) | Dono | `.env.hml`: `NINETY_NINE_FOOD_APP_ID`/`APP_SECRET` | Não; o dono vincula a loja e gera o pedido de teste | Existe | — |
| Pix da mensalidade | Chave **fictícia** (`specs/0215` T023) | — | `.env.hml`: `BILLING_PIX_KEY`/`BILLING_PIX_BENEFICIARY_NAME` | — | **A trocar** (hoje são os reais) | — |
| Imagens (AWS S3) | Bucket **`mobbs-delivery-images-hml`** só com as imagens padrão (`specs/0215` T022) | Conta AWS do dono | `.env.hml`: `S3_BUCKET_NAME`; permissão do servidor de hml | Não | **A criar** (hoje usa o bucket de produção) | — |
| E-mail (SMTP) | Caixa de teste (Mailtrap ou remetente de teste no Amazon SES) — e-mails não chegam a ninguém | Dono | `.env.hml`: `SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM` | Convidar para ver a caixa de teste (Mailtrap permite) | **A criar** (vazio em produção e hml) | Remover o convite |
| Sentry | Mesmo projeto da produção, separado por `NODE_ENV=homologacao` | Dono | `.env.hml`: `SENTRY_DSN` | Não | Existe | — |
| Google Places | Mesma chave da produção | Dono (Google Cloud) | `.env.hml`: `GOOGLE_PLACES_API_KEY` | Não | Existe | — |
| Banco (MongoDB hml) | Banco do servidor de homologação | — | `.env.hml`: `DB_URL`, `MONGO_USER`/`MONGO_PASSWORD` (diferentes dos de produção) | Não | Existe (sobe com o servidor) | — |
| SSH do QA (logs) | Usuário `qa`, só leitura, sem `sudo` (`specs/0215` T016) | — | Chave pública do QA no servidor; IP dele liberado na porta | **Sim** (é para ele) | A configurar quando o QA mandar a chave e o IP | `aws/scripts/qa-ssh-remover.sh` |

## De restaurante (o QA usa, digitando na retaguarda de homologação)

| Integração | De quem é a credencial | Como o QA recebe | Situação | No fim do teste |
|---|---|---|---|---|
| iFood | Loja de teste do app de teste do dono | Credenciais da loja, **em separado** | Existe (22/11/2026) | Trocar o Client Secret da loja de teste |
| Uber Entregas | **Do QA**: conta própria em developer.uber.com, app de teste | Ele cria | — | Nada (é dele) |
| FocusNFe (fiscal) | **Do QA**: CNPJ, certificado A1 e token de homologação próprios | Ele usa os dele | — | Nada (é dele) |
| Mercado Pago (vínculo) | Contas de teste "Pizzaria teste", "Hamburgueria teste", "Pastelaria teste" (uma por restaurante) | Login fictício, em separado, só se for testar Desvincular/Vincular | Existe | Ver linha das contas de teste |
| Keeta / Instagram | — | — | Sem credenciamento: não dá para testar | — |

## Quando o QA terminar

1. `aws/scripts/qa-ssh-remover.sh` (acesso SSH e IP).
2. Remover o QA dos painéis em que foi convidado (Asaas sandbox, Mailtrap, Mercado Pago se houver).
3. Gerar senha nova das contas de teste entregues ao QA ("Cliente teste", "Cliente teste 2" e as de restaurante, se foram entregues) (Mercado Pago → Contas de teste).
4. Trocar o Client Secret da loja iFood de teste.
5. Atualizar a coluna "Situação" deste arquivo.
