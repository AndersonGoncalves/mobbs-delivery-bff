import type { Request } from 'restify';

import { IRestaurantOperatorRepository } from '../../modules/restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { buildRestaurantOperatorMiddleware } from './restaurant-operator.middleware';

function buildRequest(email?: string): Request {
  return { user: email ? { uid: 'uid-1', email } : undefined } as unknown as Request;
}

describe('restaurantOperatorMiddleware', () => {
  it('AC-9 (specs/0002-autenticacao): rejeita com 403 quando o e-mail não é operador de nenhum restaurante', async () => {
    const repository: Partial<IRestaurantOperatorRepository> = {
      findActiveOperatorByEmail: jest.fn().mockResolvedValue(null),
    };
    const middleware = buildRestaurantOperatorMiddleware(repository as IRestaurantOperatorRepository);
    const req = buildRequest('fora-da-lista@example.com');

    await expect(middleware(req)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejeita com 403 quando o token não tem e-mail associado', async () => {
    const repository: Partial<IRestaurantOperatorRepository> = {
      findActiveOperatorByEmail: jest.fn(),
    };
    const middleware = buildRestaurantOperatorMiddleware(repository as IRestaurantOperatorRepository);
    const req = buildRequest(undefined);

    await expect(middleware(req)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findActiveOperatorByEmail).not.toHaveBeenCalled();
  });

  it('AC-8 (specs/0002-autenticacao): disponibiliza req.restaurantId quando o e-mail é operador ativo', async () => {
    const repository: Partial<IRestaurantOperatorRepository> = {
      findActiveOperatorByEmail: jest
        .fn()
        .mockResolvedValue({ id: 'op-1', restaurantId: 'r-1', email: 'ana@example.com', isActive: true, createdAt: new Date() }),
    };
    const middleware = buildRestaurantOperatorMiddleware(repository as IRestaurantOperatorRepository);
    const req = buildRequest('ana@example.com');

    await middleware(req);

    expect(req.restaurantId).toBe('r-1');
  });
});
