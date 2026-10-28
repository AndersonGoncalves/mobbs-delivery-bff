import type { Request } from 'restify';
import { buildTotemApiKeyMiddleware } from './totem-api-key.middleware';
import { IRestaurantRepository } from '../../modules/restaurants/domain/repositories/restaurant.repository.interface';

function buildReq(apiKey: string | undefined): Request {
  return { header: () => apiKey } as unknown as Request;
}

describe('totemApiKeyMiddleware (specs/0155-app-totem-autoatendimento)', () => {
  it('resolve req.restaurantId a partir de uma chave de totem válida', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByTotemApiKey: jest.fn().mockResolvedValue({ id: 'r-1' }),
    };
    const middleware = buildTotemApiKeyMiddleware(restaurantRepository as IRestaurantRepository);
    const req = buildReq('totem-key-1');

    await middleware(req);

    expect(restaurantRepository.findByTotemApiKey).toHaveBeenCalledWith('totem-key-1');
    expect(req.restaurantId).toBe('r-1');
  });

  it('rejeita (401) sem header de chave', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = { findByTotemApiKey: jest.fn() };
    const middleware = buildTotemApiKeyMiddleware(restaurantRepository as IRestaurantRepository);

    await expect(middleware(buildReq(undefined))).rejects.toMatchObject({ statusCode: 401 });
    expect(restaurantRepository.findByTotemApiKey).not.toHaveBeenCalled();
  });

  it('rejeita (401) chave que não casa com nenhum restaurante', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByTotemApiKey: jest.fn().mockResolvedValue(null),
    };
    const middleware = buildTotemApiKeyMiddleware(restaurantRepository as IRestaurantRepository);

    await expect(middleware(buildReq('key-invalida'))).rejects.toMatchObject({ statusCode: 401 });
  });
});
