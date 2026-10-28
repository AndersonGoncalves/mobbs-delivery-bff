# Facebook/Instagram — habilitar a automação de postagens do zero

Este sistema usa **Facebook Login for Business + Instagram Graph API**: a plataforma tem uma
aplicação registrada no Meta for Developers; cada restaurante autoriza essa aplicação a publicar
na **própria conta Instagram Business** dele (vinculada a uma Página do Facebook). Não há
publicação em nome da plataforma nem acesso a contas que não autorizaram explicitamente.

## 1. Criar a aplicação da plataforma (administrador do sistema)

1. Entre em [Meta for Developers](https://developers.facebook.com/apps) com a conta que
   administrará a integração e crie uma aplicação do tipo "Negócios" (Business).
2. Adicione os produtos **Facebook Login** e **Instagram Graph API** à aplicação.
3. Em **Configurações do app → Básico**, localize o **ID do app** (`FACEBOOK_APP_ID`) e a
   **Chave secreta do app** (`FACEBOOK_APP_SECRET`). Não confunda com um token de acesso de
   usuário — são credenciais da aplicação, não de uma conta específica.
4. Em **Facebook Login → Configurações**, cadastre em **URIs de redirecionamento do OAuth
   válidos** exatamente:

   ```text
   https://bsdelivery.com.br/painel/settings/instagram-automation/callback
   ```

   Sem barra adicional, sem query, sem trocar domínio.
5. Solicite (ou já tenha aprovadas) as permissões de revisão do Meta necessárias pro fluxo
   funcionar em produção, com usuários reais fora da lista de testadores da aplicação:
   `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
   A aprovação **não é instantânea** (App Review do Meta) — enquanto pendente, só contas
   cadastradas como "Testador" ou "Administrador" da aplicação no próprio painel do Meta
   conseguem autorizar.
6. A conta Instagram do restaurante precisa ser **Business/Criador de conteúdo** e estar
   vinculada a uma **Página do Facebook** (exigência do Meta, não deste sistema — sem isso o
   Instagram Graph API não enxerga a conta).

Referência oficial:
[Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business) ·
[Instagram Graph API — Content Publishing](https://developers.facebook.com/docs/instagram-api/guides/content-publishing).
Os nomes/posições dos menus podem variar no portal.

## 2. Configurar o BFF (não colocar segredos na retaguarda)

Preencha no `.env` **privado do BFF que realmente atende a produção**:

```dotenv
FACEBOOK_APP_ID=ID_NUMERICO_DO_APP
FACEBOOK_APP_SECRET=CHAVE_SECRETA_DO_MESMO_APP
FACEBOOK_REDIRECT_URI=https://bsdelivery.com.br/painel/settings/instagram-automation/callback
```

Os textos maiúsculos são placeholders, não valores para copiar literalmente. `FACEBOOK_APP_ID` é
numérico; `FACEBOOK_APP_SECRET` nunca deve ser exposto no front (`VITE_*`) nem em logs.

Não versione `.env`, não publique tokens em screenshots. Depois de alterar o ambiente,
**reinicie/recrie a instância BFF** pelo procedimento habitual de execução/deploy — variáveis de
um processo/container já iniciado não mudam sozinhas.

Enquanto essas três variáveis não estiverem definidas, a tela **Integrações → Automação
Instagram** mostra o aviso "A plataforma ainda precisa configurar no BFF..." e mantém o botão
"Autorizar no Facebook" desabilitado (comportamento esperado, não é um bug).

## 3. Publicar as correções e autorizar a conta de cada loja

1. Na retaguarda da loja, entre como **Dono ou Gerente**.
2. Abra **Integrações → Automação Instagram** em `https://bsdelivery.com.br/painel`.
3. Clique **Autorizar no Facebook**. Permita pop-ups se solicitado.
4. Entre com a conta Facebook **dona da Página vinculada ao Instagram Business da loja** e
   autorize a aplicação com as permissões solicitadas.
5. Aguarde o retorno pra `/painel/settings/instagram-automation/callback` confirmando o vínculo.

## 4. Testar antes de liberar pra uso real

- Antes da aprovação do App Review, só contas cadastradas como testador/administrador da
  aplicação no painel do Meta conseguem completar o fluxo — um restaurante real, fora dessa
  lista, recebe erro de permissão do próprio Facebook, não deste sistema.
- Agende uma postagem de teste e confirme que ela publica no horário certo na conta Instagram
  vinculada.
- O fluxo completo com credenciais/conta reais **não foi homologado em produção nesta tarefa** —
  validar a publicação de verdade é obrigatório antes de divulgar a funcionalidade aos
  restaurantes.

## Diagnóstico rápido

| Sintoma | Conferir |
|---|---|
| Aviso "plataforma ainda precisa configurar" / botão desabilitado | `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`/`FACEBOOK_REDIRECT_URI` no `.env` do BFF que está respondendo; reinicie após editar |
| Callback inválido/URI não corresponde | URI cadastrada no Facebook Login idêntica a `FACEBOOK_REDIRECT_URI`, mesmo domínio e path |
| Erro de permissão ao autorizar | Conta usada não é testador/administrador da aplicação enquanto o App Review está pendente |
| Autorizou mas não publica | Conta Instagram não é Business/Criador de conteúdo, ou não está vinculada a uma Página do Facebook |

## Resumo rápido

1. Criar aplicação Facebook Login + Instagram Graph API no Meta for Developers.
2. Cadastrar o URI de redirecionamento exato e configurar as três variáveis `FACEBOOK_*`.
3. Submeter as permissões pro App Review (ou usar conta testador enquanto pendente).
4. Publicar as correções, abrir Integrações → Automação Instagram e autorizar a Página/conta da
   loja.
5. Agendar uma postagem de teste e confirmar a publicação real antes de divulgar aos
   restaurantes.
