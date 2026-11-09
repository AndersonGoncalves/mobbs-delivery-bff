import type { Request } from 'restify';
import { buildRateLimitMiddleware } from './rate-limit.middleware';

function buildReq(ip: string): Request {
  return { headers: {}, socket: { remoteAddress: ip } } as unknown as Request;
}

describe('rateLimitMiddleware', () => {
  afterEach(() => jest.useRealTimers());

  it('permite até `max` requisições dentro da janela e rejeita a seguinte com 429', async () => {
    const middleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 3 });
    const req = buildReq('1.2.3.4');

    await middleware(req);
    await middleware(req);
    await middleware(req);
    await expect(middleware(req)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('cada IP tem sua própria contagem, independente', async () => {
    const middleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 1 });

    await middleware(buildReq('1.1.1.1'));
    await expect(middleware(buildReq('1.1.1.1'))).rejects.toMatchObject({ statusCode: 429 });
    await expect(middleware(buildReq('2.2.2.2'))).resolves.toBeUndefined();
  });

  it('libera de novo depois que a janela expira', async () => {
    jest.useFakeTimers();
    const middleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 1 });
    const req = buildReq('3.3.3.3');

    await middleware(req);
    await expect(middleware(req)).rejects.toMatchObject({ statusCode: 429 });

    jest.advanceTimersByTime(10_001);

    await expect(middleware(req)).resolves.toBeUndefined();
  });

  it('usa x-forwarded-for quando presente (atrás do Nginx), não o IP do socket', async () => {
    const middleware = buildRateLimitMiddleware({ windowMs: 10_000, max: 1 });
    const req = { headers: { 'x-forwarded-for': '9.9.9.9, 127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;

    await middleware(req);
    await expect(middleware(req)).rejects.toMatchObject({ statusCode: 429 });
    // mesmo socket, x-forwarded-for diferente -> IP efetivo diferente -> não compartilha contagem
    const otherReq = { headers: { 'x-forwarded-for': '8.8.8.8' }, socket: { remoteAddress: '127.0.0.1' } } as unknown as Request;
    await expect(middleware(otherReq)).resolves.toBeUndefined();
  });
});
