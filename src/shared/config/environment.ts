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
};
