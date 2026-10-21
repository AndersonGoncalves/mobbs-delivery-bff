import type { Request } from 'restify';
import { buildPaymentWebhookApiKeyMiddleware } from './payment-webhook-api-key.middleware';
import { IRestaurantRepository } from '../../modules/restaurants/domain/repositories/restaurant.repository.interface';

function buildReq(apiKey: string | undefined): Request {
  return { header: () => apiKey } as unknown as Request;
}

describe('paymentWebhookApiKeyMiddleware (specs/0140-confirmacao-automatica-pix)', () => {
  it('resolve req.restaurantId a partir de uma chave de API válida', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByPaymentWebhookApiKey: jest.fn().mockResolvedValue({ id: 'r-1' }),
    };
    const middleware = buildPaymentWebhookApiKeyMiddleware(restaurantRepository as IRestaurantRepository);
    const req = buildReq('key-1');

    await middleware(req);

    expect(restaurantRepository.findByPaymentWebhookApiKey).toHaveBeenCalledWith('key-1');
    expect(req.restaurantId).toBe('r-1');
  });

  it('rejeita (401) sem header de chave', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = { findByPaymentWebhookApiKey: jest.fn() };
    const middleware = buildPaymentWebhookApiKeyMiddleware(restaurantRepository as IRestaurantRepository);

    await expect(middleware(buildReq(undefined))).rejects.toMatchObject({ statusCode: 401 });
    expect(restaurantRepository.findByPaymentWebhookApiKey).not.toHaveBeenCalled();
  });

  it('rejeita (401) chave que não casa com nenhum restaurante', async () => {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByPaymentWebhookApiKey: jest.fn().mockResolvedValue(null),
    };
    const middleware = buildPaymentWebhookApiKeyMiddleware(restaurantRepository as IRestaurantRepository);

    await expect(middleware(buildReq('key-invalida'))).rejects.toMatchObject({ statusCode: 401 });
  });
});
