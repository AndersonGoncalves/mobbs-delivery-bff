import type { Request, Response, Server } from 'restify';
import * as admin from 'firebase-admin';

import { IAddressRepository } from '../domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { IFavoriteRepository } from '../domain/repositories/favorite.repository.interface';
import { CustomersController } from './customers.controller';

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  auth: jest.fn(),
}));

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & {
  user?: { uid: string; email?: string; name?: string; picture?: string };
};
type FakeResponse = Partial<Pick<Response, 'json' | 'send'>>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), post: register('POST'), put: register('PUT'), del: register('DEL'), patch: register('PATCH') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` (único da chain, tem spec própria) — injeta `req.user` manualmente.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return { id: 'c-1', name: 'Ana', email: 'ana@example.com', ...overrides };
}

function buildFavorite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-1',
    customerId: 'c-1',
    restaurantId: 'r-1',
    productId: 'p-1',
    createdAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function buildAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    customerId: 'c-1',
    label: 'Casa',
    street: 'Rua A',
    number: '123',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01001000',
    isDefault: true,
    ...overrides,
  };
}

describe('CustomersController', () => {
  function setup(
    overrides: {
      customerRepository?: Partial<ICustomerRepository>;
      addressRepository?: Partial<IAddressRepository>;
      favoriteRepository?: Partial<IFavoriteRepository>;
    } = {},
  ) {
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue(buildCustomer()),
      upsertProfile: jest.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
      acceptTerms: jest.fn().mockImplementation(async (id, version) => ({
        ...buildCustomer(),
        termsAcceptedAt: '2026-09-09T00:00:00.000Z',
        termsVersionAccepted: version,
      })),
      anonymize: jest.fn().mockResolvedValue(undefined),
      ...overrides.customerRepository,
    };
    const addressRepository: Partial<IAddressRepository> = {
      listByCustomer: jest.fn().mockResolvedValue([buildAddress()]),
      findById: jest.fn().mockResolvedValue(buildAddress()),
      create: jest.fn().mockResolvedValue(buildAddress({ id: 'a-2' })),
      update: jest.fn().mockResolvedValue(buildAddress({ label: 'Trabalho' })),
      remove: jest.fn().mockResolvedValue([]),
      setDefault: jest.fn().mockResolvedValue([buildAddress()]),
      removeAllByCustomer: jest.fn().mockResolvedValue(undefined),
      ...overrides.addressRepository,
    };
    const favoriteRepository: Partial<IFavoriteRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildFavorite()]),
      add: jest.fn().mockResolvedValue(buildFavorite()),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.favoriteRepository,
    };
    const { application, routes } = buildFakeApplication();
    new CustomersController(
      customerRepository as ICustomerRepository,
      addressRepository as IAddressRepository,
      favoriteRepository as IFavoriteRepository,
    ).initializeRoutes(application);
    return { customerRepository, addressRepository, favoriteRepository, routes };
  }

  it('AC-1: GET /customers/me devolve o Customer persistido quando já existe', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /customers/me'], { user: { uid: 'c-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'c-1', name: 'Ana' }));
  });

  it('GET /customers/me sintetiza o perfil a partir do token quando ainda não existe Customer persistido', async () => {
    const { routes } = setup({ customerRepository: { findById: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['GET /customers/me'],
      { user: { uid: 'c-1', email: 'ana@example.com', name: 'Ana', picture: 'http://pic' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ id: 'c-1', name: 'Ana', email: 'ana@example.com', photoUrl: 'http://pic' }),
    );
  });

  it('AC-1: PUT /customers/me cria o Customer no primeiro acesso com name/email resolvidos do token', async () => {
    const { customerRepository, routes } = setup({ customerRepository: { findById: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PUT /customers/me'],
      { user: { uid: 'c-1', email: 'ana@example.com', name: 'Ana' }, body: { phone: '11999999999' } },
      { json },
    );

    expect(customerRepository.upsertProfile).toHaveBeenCalledWith('c-1', {
      name: 'Ana',
      email: 'ana@example.com',
      photoUrl: undefined,
      phone: '11999999999',
      document: undefined,
    });
  });

  it('PUT /customers/me preserva campos existentes quando o corpo não os envia', async () => {
    const { customerRepository, routes } = setup({
      customerRepository: {
        findById: jest.fn().mockResolvedValue(buildCustomer({ phone: '11888888888', document: '52998224725' })),
      },
    });

    await runAuthenticatedChain(
      routes['PUT /customers/me'],
      { user: { uid: 'c-1' }, body: { name: 'Ana Nova' } },
      { json: jest.fn() },
    );

    expect(customerRepository.upsertProfile).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ name: 'Ana Nova', phone: '11888888888', document: '52998224725' }),
    );
  });

  it('AC-11: PUT /customers/me rejeita CPF com dígito verificador inválido', async () => {
    const { customerRepository, routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PUT /customers/me'],
        { user: { uid: 'c-1' }, body: { document: '111.111.111-11' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(customerRepository.upsertProfile).not.toHaveBeenCalled();
  });

  it('AC-11: PUT /customers/me aceita CPF com dígito verificador válido', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PUT /customers/me'],
        { user: { uid: 'c-1' }, body: { document: '529.982.247-25' } },
        { json: jest.fn() },
      ),
    ).resolves.toBeUndefined();
  });

  it('AC-2: GET /customers/me/addresses lista os endereços do próprio cliente (token, não da rota)', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /customers/me/addresses'], { user: { uid: 'c-1' } }, { json });

    expect(addressRepository.listByCustomer).toHaveBeenCalledWith('c-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'a-1' })]);
  });

  it('AC-3: POST /customers/me/addresses cria o endereço pro cliente do token', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();
    const body = { label: 'Casa', street: 'Rua A', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01001000' };

    await runAuthenticatedChain(routes['POST /customers/me/addresses'], { user: { uid: 'c-1' }, body }, { json });

    expect(addressRepository.create).toHaveBeenCalledWith('c-1', body);
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'a-2' }));
  });

  it('AC-4: PUT /customers/me/addresses/:id edita um endereço do próprio cliente', async () => {
    const { routes } = setup();
    const json = jest.fn();
    const body = { label: 'Trabalho', street: 'Rua A', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01001000' };

    await runAuthenticatedChain(
      routes['PUT /customers/me/addresses/:id'],
      { user: { uid: 'c-1' }, params: { id: 'a-1' }, body },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ label: 'Trabalho' }));
  });

  it('PUT /customers/me/addresses/:id lança 404 quando o endereço é de outro cliente', async () => {
    const { routes } = setup({ addressRepository: { findById: jest.fn().mockResolvedValue(buildAddress({ customerId: 'outro' })) } });
    const body = { label: 'x', street: 'Rua A', number: '123', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01001000' };

    await expect(
      runAuthenticatedChain(
        routes['PUT /customers/me/addresses/:id'],
        { user: { uid: 'c-1' }, params: { id: 'a-1' }, body },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-5/AC-7: DELETE /customers/me/addresses/:id remove e devolve a lista já reatribuída', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['DEL /customers/me/addresses/:id'],
      { user: { uid: 'c-1' }, params: { id: 'a-1' } },
      { json },
    );

    expect(addressRepository.remove).toHaveBeenCalledWith('a-1');
    expect(json).toHaveBeenCalledWith(200, []);
  });

  it('DELETE /customers/me/addresses/:id lança 404 quando o endereço é de outro cliente', async () => {
    const { routes } = setup({ addressRepository: { findById: jest.fn().mockResolvedValue(buildAddress({ customerId: 'outro' })) } });

    await expect(
      runAuthenticatedChain(
        routes['DEL /customers/me/addresses/:id'],
        { user: { uid: 'c-1' }, params: { id: 'a-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-6: PATCH /customers/me/addresses/:id/default marca como padrão e devolve a lista atualizada', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PATCH /customers/me/addresses/:id/default'],
      { user: { uid: 'c-1' }, params: { id: 'a-1' } },
      { json },
    );

    expect(addressRepository.setDefault).toHaveBeenCalledWith('c-1', 'a-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'a-1' })]);
  });

  it('AC-2: PATCH /customers/me/terms-acceptance grava a versão aceita', async () => {
    const { customerRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PATCH /customers/me/terms-acceptance'],
      { user: { uid: 'c-1' }, body: { version: '2026-09-08' } },
      { json },
    );

    expect(customerRepository.acceptTerms).toHaveBeenCalledWith('c-1', '2026-09-08');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ termsVersionAccepted: '2026-09-08' }));
  });

  it('PATCH /customers/me/terms-acceptance rejeita corpo sem version', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PATCH /customers/me/terms-acceptance'],
        { user: { uid: 'c-1' }, body: {} },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  describe('favoritos (specs/0012-favoritos)', () => {
    it('AC-3: GET /customers/me/favorites lista os favoritos do restaurante atual', async () => {
      const { favoriteRepository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['GET /customers/me/favorites'],
        { user: { uid: 'c-1' }, query: { restaurantId: 'r-1' } },
        { json },
      );

      expect(favoriteRepository.listByRestaurant).toHaveBeenCalledWith('c-1', 'r-1');
      expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'f-1' })]);
    });

    it('GET /customers/me/favorites rejeita sem restaurantId na query', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['GET /customers/me/favorites'],
          { user: { uid: 'c-1' }, query: {} },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-1: POST /customers/me/favorites favorita um produto pro cliente do token', async () => {
      const { favoriteRepository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['POST /customers/me/favorites'],
        { user: { uid: 'c-1' }, body: { restaurantId: 'r-1', productId: 'p-1' } },
        { json },
      );

      expect(favoriteRepository.add).toHaveBeenCalledWith('c-1', 'r-1', 'p-1');
      expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'f-1' }));
    });

    it('AC-2: DELETE /customers/me/favorites/:productId desfavorita', async () => {
      const { favoriteRepository, routes } = setup();
      const send = jest.fn();

      await runAuthenticatedChain(
        routes['DEL /customers/me/favorites/:productId'],
        { user: { uid: 'c-1' }, params: { productId: 'p-1' } },
        { send },
      );

      expect(favoriteRepository.remove).toHaveBeenCalledWith('c-1', 'p-1');
      expect(send).toHaveBeenCalledWith(204);
    });
  });

  describe('DELETE /customers/me (specs/0017-lgpd-privacidade)', () => {
    beforeEach(() => {
      (admin.auth as unknown as jest.Mock).mockReturnValue({ deleteUser: jest.fn().mockResolvedValue(undefined) });
    });

    it('AC-5: anonimiza o Customer, apaga os Address e exclui a conta no Firebase, nessa ordem', async () => {
      const { addressRepository, customerRepository, routes } = setup();
      const send = jest.fn();
      const callOrder: string[] = [];
      (customerRepository.anonymize as jest.Mock).mockImplementation(async () => {
        callOrder.push('anonymize');
      });
      (addressRepository.removeAllByCustomer as jest.Mock).mockImplementation(async () => {
        callOrder.push('removeAllByCustomer');
      });
      const deleteUser = jest.fn().mockImplementation(async () => {
        callOrder.push('deleteUser');
      });
      (admin.auth as unknown as jest.Mock).mockReturnValue({ deleteUser });

      await runAuthenticatedChain(routes['DEL /customers/me'], { user: { uid: 'c-1' } }, { send });

      expect(customerRepository.anonymize).toHaveBeenCalledWith('c-1');
      expect(addressRepository.removeAllByCustomer).toHaveBeenCalledWith('c-1');
      expect(deleteUser).toHaveBeenCalledWith('c-1');
      expect(callOrder).toEqual(['anonymize', 'removeAllByCustomer', 'deleteUser']);
      expect(send).toHaveBeenCalledWith(204);
    });
  });
});
