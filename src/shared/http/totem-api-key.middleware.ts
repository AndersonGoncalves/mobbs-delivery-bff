import type { Request } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { IRestaurantRepository } from '../../modules/restaurants/domain/repositories/restaurant.repository.interface';

/**
 * specs/0155-app-totem-autoatendimento REQ-1/REQ-16 — autentica o totem físico pelo header
 * `X-Totem-Api-Key`, sem token Firebase nem operador logado (mesmo papel de
 * `printApiKeyMiddleware`/`specs/0139`, aqui pro totem em vez do bridge de impressão). Resolve
 * `req.restaurantId` a partir da chave, escopando toda rota de totem ao restaurante dela — o
 * totem nunca informa `restaurantId` por conta própria (REQ-16: "autentica só pela chave do
 * totem, escopada ao restaurante dela").
 */
export function buildTotemApiKeyMiddleware(restaurantRepository: IRestaurantRepository) {
  return async function totemApiKeyMiddleware(req: Request): Promise<void> {
    const apiKey = req.header('x-totem-api-key');
    if (!apiKey) throw new UnauthorizedError('Chave de API do totem não informada');

    const restaurant = await restaurantRepository.findByTotemApiKey(apiKey);
    if (!restaurant) throw new UnauthorizedError('Chave de API do totem inválida');

    req.restaurantId = restaurant.id;
  };
}
