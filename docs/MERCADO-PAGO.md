# Mercado Pago — habilitar Cartão de Crédito Online do zero

Este sistema usa **Checkout Pro + OAuth**: a plataforma tem uma aplicação Mercado Pago;
cada restaurante autoriza essa aplicação a receber na **conta da própria loja**.
Não é necessário cadastrar cartões dos consumidores no nosso sistema.
Cartão de Crédito/Débito **Maquininha** continua sendo pagamento presencial.

## 1. Criar a aplicação da plataforma (administrador do sistema)

1. Entre com a conta Mercado Pago que administrará a integração em
   [Suas integrações](https://www.mercadopago.com.br/developers/panel/app).
2. Crie uma aplicação para pagamentos online com **Checkout Pro**, integrada por desenvolvimento
   próprio. Se o portal apresentar opções de plataforma/marketplace ou OAuth para atuar em nome
   de vendedores, configure esse modelo: as contas das lojas serão vinculadas, não substituídas
   por uma única conta recebedora.
3. Complete os dados e os requisitos de ativação/credenciais de produção solicitados pelo portal.
   A aprovação/disponibilidade depende da conta Mercado Pago; criar a aplicação não garante
   aprovação comercial ou que todas as modalidades estejam liberadas.
4. Em detalhes/edição da aplicação, localize **Application ID (número da aplicação)** e
   **Client Secret**. Não confunda Application ID com Public Key ou Access Token.
5. Cadastre em **URLs de redirecionamento** exatamente:

   ```text
   https://bsdelivery.com.br/painel/settings/mercadopago/callback
   ```

   Sem barra adicional, sem query, sem trocar domínio e sem remover `/settings`.
   A URL é da **retaguarda**, não da API e não do painel do proprietário da plataforma
   (`painel.bsdelivery.com.br`).
6. O fluxo implementado envia PKCE **S256** (`code_challenge`, `code_challenge_method` e
   `code_verifier`). Pode habilitar o uso de PKCE na aplicação. Se ele já estava habilitado,
   o fluxo antigo sem esses campos podia falhar na autorização.

Referência oficial: [OAuth / criação e PKCE](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation).
Os nomes/posições dos menus podem variar no portal.

## 2. Configurar o BFF (não colocar segredos na retaguarda)

Preencha no `.env` **privado do BFF que realmente atende a produção**:

```dotenv
MERCADOPAGO_CLIENT_ID=NUMERO_DA_APLICACAO
MERCADOPAGO_CLIENT_SECRET=CLIENT_SECRET_DA_MESMA_APLICACAO
MERCADOPAGO_REDIRECT_URI=https://bsdelivery.com.br/painel/settings/mercadopago/callback
MERCADOPAGO_BASE_URL=https://api.mercadopago.com
MERCADOPAGO_PLATFORM_ACCESS_TOKEN=ACCESS_TOKEN_DE_PRODUCAO_DA_APLICACAO
MERCADOPAGO_WEBHOOK_SECRET=ASSINATURA_SECRETA_DOS_WEBHOOKS
BFF_PUBLIC_BASE_URL=https://api.bsdelivery.com.br
PUBLIC_APP_BASE_URL=https://bsdelivery.com.br
```

Os textos maiúsculos são placeholders, não valores para copiar literalmente.
O Application ID é numérico; Client Secret/Access Token/segredo de webhook são **três dados
diferentes** e devem pertencer à mesma integração/ambiente.
O token da plataforma é usado pelo receptor de webhook existente para consultar pagamentos;
o token de cada loja é obtido pelo OAuth, não deve ser digitado no frontend.

Não versione `.env`, não publique tokens em screenshots e não use `VITE_*` para segredos.
Depois de alterar o ambiente, **reinicie/recrie a instância BFF** pelo procedimento habitual
de execução/deploy. Variáveis de um processo/container já iniciado não mudam sozinhas.
Se usa Compose, confirme que o serviço `api` recebe esse `.env`; não basta editar o arquivo
de outro checkout no computador.

### Por que antes aparecia `Invalid request parameters`?

O fluxo anterior montava a URL com `VITE_MERCADOPAGO_CLIENT_ID`, mas o workflow de build web
não injetava essa variável. Era possível publicar uma URL com `client_id` ausente/indefinido.
Além disso, a autorização calculava o callback no navegador enquanto a troca usava outro
valor do BFF. O Mercado Pago exige correspondência exata com a URL cadastrada.

Agora a página obtém Application ID e callback do BFF autenticado e mostra configurações
faltantes **antes** de autorizar. Não depende mais de `VITE_MERCADOPAGO_CLIENT_ID` nem de
adicionar essa variável no GitHub Actions.

Não foi feita inspeção das credenciais privadas/conta de produção. Se continuar falhando:
confira Application ID, aplicação/ambiente correto, callback cadastrado e configurações OAuth
no portal. A validação local verifica formato/presença, não verifica se o segredo é autêntico.

## 3. Webhook — necessário para confirmar e liberar o pedido

Na aplicação Mercado Pago, abra as configurações de **Webhooks**:

1. Cadastre a URL pública HTTPS:

   ```text
   https://api.bsdelivery.com.br/webhooks/mercadopago
   ```

2. Selecione eventos de **Pagamentos / payment**.
3. Copie a assinatura secreta para `MERCADOPAGO_WEBHOOK_SECRET` e reinicie o BFF.
4. Confirme que proxy/TLS/firewall encaminham `POST` para essa rota sem exigir login Firebase.
   A proteção dessa rota é a assinatura do Mercado Pago.
5. Use o painel de notificações/logs para verificar a entrega e HTTP de resposta.

O BFF também envia essa URL em `notification_url` ao criar a preferência.
**Voltar do checkout ou ver “sucesso” no navegador não confirma o pedido**: o BFF consulta o
pagamento e só aprova quando o evento válido informa status `approved`.
Notificação simulada com ID inexistente não prova conciliação de um pagamento real.

Referência: [Notificações Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks).

## 4. Publicar as correções e vincular a conta de cada loja

As alterações de código precisam estar publicadas em **BFF, retaguarda e app** para atingir
produção. Os ajustes desta tarefa não fazem deploy automaticamente.

1. Na retaguarda da loja, entre como **Dono ou Gerente**.
2. Abra **Integrações → Mercado Pago** em `https://bsdelivery.com.br/painel`.
3. A tela mostra a URL de retorno e informa configurações ausentes.
4. Clique **Vincular com Mercado Pago**. Permita pop-ups se solicitado.
5. Uma nova aba abre; a aba da retaguarda permanece onde estava.
6. Entre na conta Mercado Pago **da loja que receberá os pagamentos** e autorize a aplicação.
   Não autorize todas as lojas com a conta da plataforma por engano.
7. Aguarde a mensagem de conta vinculada. Pode fechar essa aba.
8. Na aba original, clique **Atualizar vínculo** (também há atualização ao voltar o foco).

O callback precisa usar a mesma origem da página que iniciou o vínculo para preservar nonce
e login. A tela impede iniciar a partir de outro domínio.
Se o código expirar ou uma tentativa falhar, **inicie nova autorização**; códigos são de uso
único. Não cole URLs de callback antigas nem compartilhe `code`, `state` ou verifier.

## 5. Fazer Cartão de Crédito Online aparecer no app

São condições independentes:

1. **Vínculo real**: BFF salvou o token da conta da loja. A API pública retorna
   `mercadoPagoLinked: true`, nunca o token.
2. **Forma aceita pelo restaurante**: habilite **Cartão de Crédito Online** em
   **Configurações → Formas de pagamento** e salve.
3. **Permissão do cliente**: se existir uma lista restrita de meios permitidos para aquele
   cliente, inclua `creditCardOnline` nela. A opção usa a interseção das permissões.
4. Reabra/recarregue o app da loja para buscar a configuração nova.

Não confunda com **Cartão de Crédito Maquininha**, que é outro enum (`creditCard`).
Ligar somente o checkbox não cria o vínculo e não deve expor uma opção incapaz de cobrar.

## 6. Testar antes de liberar aos consumidores

- Faça primeiro o fluxo de testes recomendado pelo Mercado Pago para Checkout Pro/OAuth,
  com contas comprador/vendedor de teste **distintas** e credenciais/cartões de teste
  compatíveis com esse ambiente. Consulte as instruções exibidas na sua aplicação.
- Não misture vendedor real com comprador/credenciais de teste sem que a documentação daquele
  cenário autorize. Não compre de si mesmo para “testar”.
- Gere um pedido pequeno no ambiente adequado, abra o Checkout Pro, conclua o pagamento
  e confirme webhook, status aprovado, loja recebedora e valor.
- Verifique pagamento recusado/abandonado (não deve ser aprovado), reenvio do webhook
  (sem duplicar confirmação) e cancelamento/estorno.
- O fluxo completo com credenciais reais **não foi homologado nesta tarefa**; testes locais
  usam mocks. Validar recebimento na conta vinculada é obrigatório antes de produção.
- A renovação automática dos tokens expirados **ainda não está conectada** ao fluxo existente.
  O cliente HTTP tem método de refresh, mas o processo de cobrança não o chama automaticamente.
  Se o token for revogado/expirar, use **Vincular novamente** na tela de integração;
  não interprete um vínculo histórico como garantia de credencial eternamente válida.

Para desenvolvimento local, use domínio HTTPS de desenvolvimento/túnel, callback cadastrado
nessa origem e BFF público para webhooks. `localhost` não recebe notificações externas.
Prefira uma aplicação separada de desenvolvimento: não altere o callback da produção para
testar localmente.

## Diagnóstico rápido

| Sintoma | Conferir |
|---|---|
| `Invalid request parameters` antes da autorização | Application ID numérico, callback exato cadastrado, requisitos da aplicação/PKCE |
| Tela lista variáveis ausentes | Ambiente do BFF que está atendendo a requisição; reinicie após editar |
| Botão não abre aba | Permissão de pop-ups e contexto HTTPS/WebCrypto |
| Callback inválido/expirado | Mesmo domínio, mesma aba da autorização, tentativa nova, não reutilizar código |
| Vínculo existe mas opção não aparece | Checkbox do restaurante + permissões do cliente + reabrir app |
| Checkout abre mas pedido não confirma | Webhook/assinatura/token da plataforma, logs BFF e painel de notificações |
| Falha após meses ou revogação de acesso | Refaça o vínculo; refresh automático ainda pendente |

## Resumo rápido

1. Criar aplicação Checkout Pro/OAuth no Developers.
2. Cadastrar callback exato e configurar as seis variáveis `MERCADOPAGO_*` do exemplo.
3. Cadastrar webhook `payment`, conferir URLs públicas e reiniciar BFF.
4. Publicar as correções, abrir Integrações → Mercado Pago e autorizar a conta da loja.
5. Habilitar Cartão de Crédito Online e conferir permissões do cliente.
6. Homologar pagamento + webhook + estorno antes de disponibilizar aos consumidores.
