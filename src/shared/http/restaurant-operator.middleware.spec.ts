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

  it('AC-7 (specs/0019-checkout-visitante): rejeita com 403 uma sessão de visitante (Firebase Anonymous Auth, sem e-mail)', async () => {
    // REQ-7: o Firebase Admin SDK não distingue token anônimo de token Google por padrão — mas
    // `firebaseAuthMiddleware` só copia `email` pra `req.user` quando o token decodificado tem
    // um (uma conta anônima nunca tem). Não é código novo: já existe hoje (spec 0002), só
    // documenta/trava explicitamente que sessões de visitante (specs/0019) nunca passam por aqui
    // — `req.user` de uma sessão anônima real tem `uid`, mas nunca `email`, exatamente como o
    // teste acima ("token não tem e-mail associado"), sem tratamento especial nenhum pra
    // "conta anônima" — a rejeição é estrutural, pela ausência do campo.
    const repository: Partial<IRestaurantOperatorRepository> = {
      findActiveOperatorByEmail: jest.fn(),
    };
    const middleware = buildRestaurantOperatorMiddleware(repository as IRestaurantOperatorRepository);
    const anonymousSessionRequest = { user: { uid: 'anon-uid-1' } } as unknown as Request;

    await expect(middleware(anonymousSessionRequest)).rejects.toMatchObject({ statusCode: 403 });
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
