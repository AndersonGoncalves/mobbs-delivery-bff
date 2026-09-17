import type { Request, Response, Server } from 'restify';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { UploadsController } from './uploads.controller';

jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
jest.mock('../../../shared/storage/s3-client', () => ({ s3Client: {} }));

type FakeRequest = Partial<Pick<Request, 'body' | 'restaurantId'>>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), put: register('PUT'), patch: register('PATCH'), post: register('POST'), del: register('DEL') };
  return { application: application as unknown as Server, routes };
}

async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = 'r-1';
};

describe('UploadsController', () => {
  beforeEach(() => {
    jest.mocked(getSignedUrl).mockResolvedValue('https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/restaurants/r-1/logo.png?X-Amz-Signature=abc');
  });

  function setup() {
    const { application, routes } = buildFakeApplication();
    new UploadsController(passthroughOperatorMiddleware).initializeRoutes(application);
    return { routes };
  }

  it('AC-1: devolve uploadUrl (assinada) e publicUrl (sem query string) a partir de kind+filename', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['POST /restaurants/me/uploads/presign'], { body: { kind: 'logo', filename: 'foto.png' } }, { json });

    expect(json).toHaveBeenCalledWith(200, {
      uploadUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/restaurants/r-1/logo.png?X-Amz-Signature=abc',
      publicUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/restaurants/r-1/logo.png',
    });
  });

  it('usa o restaurantId da sessão (nunca do corpo)', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /restaurants/me/uploads/presign'],
      { body: { kind: 'logo', filename: 'foto.png', restaurantId: 'outro-restaurante' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ publicUrl: expect.stringContaining('restaurants/r-1/') }));
  });

  it('rejeita com 400 quando kind não é um dos valores aceitos', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(routes['POST /restaurants/me/uploads/presign'], { body: { kind: 'invalido', filename: 'foto.png' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita com 400 quando filename está vazio', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(routes['POST /restaurants/me/uploads/presign'], { body: { kind: 'logo', filename: '' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
