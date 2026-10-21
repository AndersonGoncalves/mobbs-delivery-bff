import type { Request } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { IRestaurantRepository } from '../../modules/restaurants/domain/repositories/restaurant.repository.interface';

/**
 * specs/0140-confirmacao-automatica-pix REQ-1b — autentica um webhook de gateway/PSP de
 * pagamento pelo header `X-Payment-Webhook-Api-Key`, sem token Firebase nem operador logado
 * (quem chama é um provedor externo, não um humano logado) — mesmo raciocínio de
 * `print-api-key.middleware.ts` (`specs/0139`), chave diferente: uma não deve conseguir disparar
 * o que a outra protege. Resolve `req.restaurantId` a partir da chave.
 */
export function buildPaymentWebhookApiKeyMiddleware(restaurantRepository: IRestaurantRepository) {
  return async function paymentWebhookApiKeyMiddleware(req: Request): Promise<void> {
    const apiKey = req.header('x-payment-webhook-api-key');
    if (!apiKey) throw new UnauthorizedError('Chave de API não informada');

    const restaurant = await restaurantRepository.findByPaymentWebhookApiKey(apiKey);
    if (!restaurant) throw new UnauthorizedError('Chave de API inválida');

    req.restaurantId = restaurant.id;
  };
}
