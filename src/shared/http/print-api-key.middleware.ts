import type { Request } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { IRestaurantRepository } from '../../modules/restaurants/domain/repositories/restaurant.repository.interface';

/**
 * specs/0139-impressao-automatica-bridge — autentica o bridge local (`mobbs-delivery-print`) pelo
 * header `X-Print-Api-Key`, sem token Firebase nem operador logado (o bridge roda sem ninguém
 * autenticado, em segundo plano). Resolve `req.restaurantId` a partir da chave — mesmo papel de
 * `restaurantOperatorMiddleware`, mecanismo diferente.
 */
export function buildPrintApiKeyMiddleware(restaurantRepository: IRestaurantRepository) {
  return async function printApiKeyMiddleware(req: Request): Promise<void> {
    const apiKey = req.header('x-print-api-key');
    if (!apiKey) throw new UnauthorizedError('Chave de API não informada');

    const restaurant = await restaurantRepository.findByAutoPrintApiKey(apiKey);
    if (!restaurant) throw new UnauthorizedError('Chave de API inválida');

    req.restaurantId = restaurant.id;
  };
}
