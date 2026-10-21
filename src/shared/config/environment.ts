import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export const environment = {
  server: {
    port: Number(process.env.SERVER_PORT) || 3001,
    /** specs/0101-integracao-asaas (fase 1) — URL pública do próprio BFF (não `publicApp`, que é
     * a origem do app do cliente), usada pra montar a URL de webhook registrada no Asaas na
     * criação da subconta (`/webhooks/asaas/:restaurantId`). */
    publicBaseUrl: process.env.BFF_PUBLIC_BASE_URL || 'https://api.bsdelivery.com.br',
  },
  db: { url: process.env.DB_URL || 'mongodb://localhost:27017/mobbs-delivery' },
  /** specs/0069 — origem pública do app do cliente (Flutter Web em `<origem>/<slug>`), usada nos links
   * de acompanhamento enviados por WhatsApp. */
  publicApp: { baseUrl: process.env.PUBLIC_APP_BASE_URL || 'https://bsdelivery.com.br' },
  /** specs/0023-portabilidade-dados — SMTP genérico (qualquer provedor), sem SDK específico.
   * Sem essas variáveis configuradas, `NodemailerEmailService.send()` falha em runtime — REQ-5
   * garante que essa falha nunca trava o cliente (fire-and-forget, só logada). */
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
  },
  /** specs/0036-migracao-imagens-s3 — sem `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` aqui de
   * propósito: credenciais resolvidas pela cadeia padrão do SDK (IAM Role da instância EC2 em
   * produção; `aws configure`/variáveis de ambiente do desenvolvedor em dev local). */
  s3: {
    bucket: process.env.S3_BUCKET_NAME || 'mobbs-delivery-images',
    region: process.env.AWS_REGION || 'us-east-1',
  },
  /** specs/0123-prospeccao-restaurantes-google-maps — sem essa chave, `GooglePlacesService`
   * lança erro claro em runtime (REQ-8), nunca derruba o resto do painel da plataforma. */
  googleMaps: {
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  },
  /** specs/0101-integracao-asaas (fase 1, só Pix) — `apiKey` é da conta MÃE/plataforma, usada só
   * pra criar a subconta de cada restaurante (`POST /v3/accounts`); depois disso, toda chamada
   * em nome de um restaurante (criar cliente/cobrança, consultar QR, estornar) usa a própria
   * chave da subconta dele (`Restaurant.asaasApiKey`, devolvida uma única vez na criação), nunca
   * esta. Sem `apiKey` configurada, a criação de subconta falha com erro claro — nenhum
   * restaurante sem Asaas habilitado é afetado (REQ-5 da spec: fluxo manual continua sozinho). */
  asaas: {
    apiKey: process.env.ASAAS_API_KEY,
    baseUrl: process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3',
  },
  /** specs/0170-integracao-mercado-pago — `clientId`/`clientSecret` são da aplicação registrada
   * na plataforma Mercado Pago Developers (não por restaurante — diferente do Asaas, aqui o
   * vínculo é OAuth: cada restaurante autoriza ESTA aplicação e a gente recebe um
   * `access_token`/`refresh_token` DELE, salvos em `Restaurant.mercadoPagoAccessToken`/
   * `mercadoPagoRefreshToken`). `webhookSecret` também é por aplicação (não por restaurante,
   * ver plan.md), usado pra validar a assinatura `x-signature` de `POST /webhooks/mercadopago`.
   * `redirectUri` é a URL de callback da retaguarda (mobbs-delivery-web) que recebe o `code` do
   * OAuth e repassa pro BFF — precisa casar exatamente com a cadastrada na aplicação MP. */
  mercadoPago: {
    clientId: process.env.MERCADOPAGO_CLIENT_ID,
    clientSecret: process.env.MERCADOPAGO_CLIENT_SECRET,
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    redirectUri: process.env.MERCADOPAGO_REDIRECT_URI,
    baseUrl: process.env.MERCADOPAGO_BASE_URL || 'https://api.mercadopago.com',
    /** `Access Token` da própria aplicação (painel "Credenciais" do Mercado Pago Developers —
     * não é obtido via OAuth, diferente de `clientId`/`clientSecret`). Usado só pra resolver
     * `GET /v1/payments/{id}` na recepção do webhook (`MercadoPagoWebhookController`), quando
     * ainda não sabemos de qual restaurante é o pagamento — ver plan.md. */
    platformAccessToken: process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN,
  },
};
