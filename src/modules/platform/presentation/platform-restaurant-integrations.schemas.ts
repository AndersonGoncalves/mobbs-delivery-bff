import { z } from 'zod';

/**
 * Pedido explícito do usuário (18/11/2026) — tela de suporte da plataforma pra editar, de
 * qualquer restaurante, as credenciais de 99Food/Mercado Pago/Asaas que normalmente só são
 * preenchidas por OAuth (nunca digitadas pelo operador) — aqui o suporte digita manualmente o
 * resultado de uma autorização feita fora do mobbs (ex. token copiado do painel do parceiro),
 * pros casos em que o fluxo normal de OAuth não dá (restaurante sem acesso ao e-mail cadastrado,
 * token expirado e precisa ser trocado na mão, etc.).
 */
export const adminOverrideNinetyNineFoodSchema = z.object({
  appShopId: z.string().min(1),
  authToken: z.string().min(1),
  tokenExpiresAt: z.string().min(1),
});

export const adminOverrideMercadoPagoSchema = z.object({
  mercadoPagoAccessToken: z.string().min(1),
  mercadoPagoRefreshToken: z.string().min(1),
  mercadoPagoUserId: z.string().min(1),
  mercadoPagoTokenExpiresAt: z.string().min(1),
});

export const adminOverrideAsaasSchema = z.object({
  asaasAccountId: z.string().min(1),
  asaasWalletId: z.string().min(1),
  asaasApiKey: z.string().min(1),
  asaasWebhookToken: z.string().min(1),
});
