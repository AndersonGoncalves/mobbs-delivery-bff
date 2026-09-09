import type { Request, Response, Server } from 'restify';

import { IAddressRepository } from '../domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { CustomersController } from './customers.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { user?: { uid: string; email?: string; name?: string; picture?: string } };
type FakeResponse = Pick<Response, 'json'>;
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
  function setup(overrides: { customerRepository?: Partial<ICustomerRepository>; addressRepository?: Partial<IAddressRepository> } = {}) {
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue(buildCustomer()),
      upsertProfile: jest.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
      ...overrides.customerRepository,
    };
    const addressRepository: Partial<IAddressRepository> = {
      listByCustomer: jest.fn().mockResolvedValue([buildAddress()]),
      findById: jest.fn().mockResolvedValue(buildAddress()),
      create: jest.fn().mockResolvedValue(buildAddress({ id: 'a-2' })),
      update: jest.fn().mockResolvedValue(buildAddress({ label: 'Trabalho' })),
      remove: jest.fn().mockResolvedValue([]),
      setDefault: jest.fn().mockResolvedValue([buildAddress()]),
      ...overrides.addressRepository,
    };
    const { application, routes } = buildFakeApplication();
    new CustomersController(customerRepository as ICustomerRepository, addressRepository as IAddressRepository).initializeRoutes(
      application,
    );
    return { customerRepository, addressRepository, routes };
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
});
