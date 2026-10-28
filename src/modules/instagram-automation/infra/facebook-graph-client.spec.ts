import { FacebookGraphClient } from './facebook-graph-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  global.fetch = jest.fn();
  for (const { status, body } of responses) {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(body),
        text: jest.fn().mockResolvedValue(JSON.stringify(body)),
      }),
    );
  }
}

describe('FacebookGraphClient (follow-up — automação de postagens no Instagram)', () => {
  const client = new FacebookGraphClient('app-id', 'app-secret', 'https://graph.facebook.com/v21.0');

  afterEach(() => jest.restoreAllMocks());

  it('getAuthorizationUrl: monta a URL de autorização OAuth com os escopos necessários', () => {
    const url = client.getAuthorizationUrl('https://bsdelivery.com.br/painel/settings/instagram/callback', 'nonce-1');

    expect(url).toBe(
      'https://www.facebook.com/v21.0/dialog/oauth?client_id=app-id&redirect_uri=https%3A%2F%2Fbsdelivery.com.br%2Fpainel%2Fsettings%2Finstagram%2Fcallback&state=nonce-1&scope=pages_show_list%2Cpages_read_engagement%2Cinstagram_basic%2Cinstagram_content_publish%2Cbusiness_management&response_type=code',
    );
  });

  it('exchangeCodeForToken: GET /oauth/access_token com o code recebido', async () => {
    mockFetchOnce(200, { access_token: 'short-token', expires_in: 3600 });

    const result = await client.exchangeCodeForToken('code-1', 'https://bsdelivery.com.br/painel/settings/instagram/callback');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.facebook.com/v21.0/oauth/access_token?client_id=app-id&client_secret=app-secret'),
    );
    expect(result).toEqual({ accessToken: 'short-token', expiresIn: 3600 });
  });

  it('getLongLivedToken: GET /oauth/access_token com grant_type fb_exchange_token', async () => {
    mockFetchOnce(200, { access_token: 'long-token', expires_in: 5184000 });

    const result = await client.getLongLivedToken('short-token');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('grant_type=fb_exchange_token'));
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('fb_exchange_token=short-token'));
    expect(result).toEqual({ accessToken: 'long-token', expiresIn: 5184000 });
  });

  it('resolveInstagramBusinessAccount: acha a 1ª Página com Instagram Business vinculado', async () => {
    mockFetchSequence([
      { status: 200, body: { data: [{ id: 'page-1', access_token: 'page-token-1' }, { id: 'page-2', access_token: 'page-token-2' }] } },
      { status: 200, body: {} }, // page-1 sem instagram_business_account
      { status: 200, body: { instagram_business_account: { id: 'ig-1', username: 'minha_loja' } } }, // page-2 com vínculo
    ]);

    const result = await client.resolveInstagramBusinessAccount('user-token');

    expect(result).toEqual({ pageId: 'page-2', pageAccessToken: 'page-token-2', instagramAccountId: 'ig-1', instagramUsername: 'minha_loja' });
  });

  it('resolveInstagramBusinessAccount: devolve null quando nenhuma Página tem Instagram vinculado', async () => {
    mockFetchSequence([
      { status: 200, body: { data: [{ id: 'page-1', access_token: 'page-token-1' }] } },
      { status: 200, body: {} },
    ]);

    const result = await client.resolveInstagramBusinessAccount('user-token');

    expect(result).toBeNull();
  });

  it('createMediaContainer: POST /{ig-user-id}/media com image_url e caption', async () => {
    mockFetchOnce(200, { id: 'container-1' });

    const containerId = await client.createMediaContainer('page-token', 'ig-1', 'https://cdn.example.com/foto.jpg', 'Promoção de hoje!');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/ig-1/media',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = new URLSearchParams(options.body as string);
    expect(body.get('image_url')).toBe('https://cdn.example.com/foto.jpg');
    expect(body.get('caption')).toBe('Promoção de hoje!');
    expect(body.get('access_token')).toBe('page-token');
    expect(containerId).toBe('container-1');
  });

  it('publishMedia: POST /{ig-user-id}/media_publish com o creation_id do container', async () => {
    mockFetchOnce(200, { id: 'media-1' });

    const mediaId = await client.publishMedia('page-token', 'ig-1', 'container-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/ig-1/media_publish',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = new URLSearchParams(options.body as string);
    expect(body.get('creation_id')).toBe('container-1');
    expect(mediaId).toBe('media-1');
  });

  it('lança erro com status e corpo quando a Graph API responde com erro', async () => {
    mockFetchOnce(400, { error: { message: 'Invalid OAuth access token' } });

    await expect(client.publishMedia('token-invalido', 'ig-1', 'container-1')).rejects.toThrow(/400/);
  });
});
