import type { Request, Response, Server } from 'restify';
import { emptyLandingContent, type LandingTestimonial } from '../domain/landing-content';
import { LandingContentController } from './landing-content.controller';

jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/upload-url') }));
jest.mock('../../../shared/storage/s3-client', () => ({ s3Client: {} }));

type Handler = (req: Request, res: Response) => Promise<void>;

function buildTestimonial(overrides: Partial<LandingTestimonial> = {}): LandingTestimonial {
  return {
    id: 't-1', authorName: 'Maria', businessName: 'Pizzaria', city: 'Fortaleza', text: 'Sistema muito bom de usar',
    status: 'pending', createdAt: new Date('2026-01-01'), ...overrides,
  };
}

function setup() {
  let stored = emptyLandingContent();
  const contentRepository = {
    get: jest.fn(async () => stored),
    update: jest.fn(async (content) => { stored = content; return content; }),
  };
  const testimonialRepository = {
    create: jest.fn(async (input) => buildTestimonial(input)),
    list: jest.fn(async () => [] as LandingTestimonial[]),
    updateStatus: jest.fn(async (): Promise<LandingTestimonial | null> => buildTestimonial({ status: 'approved' })),
    delete: jest.fn(async () => true),
  };
  const admin = jest.fn();
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => { routes[`${method} ${path}`] = handlers; };
  new LandingContentController(contentRepository, testimonialRepository, admin as unknown as Handler).initializeRoutes({
    get: register('GET'), post: register('POST'), put: register('PUT'), patch: register('PATCH'), del: register('DEL'),
  } as unknown as Server);
  async function run(route: string, req: Partial<Request> = {}) {
    const json = jest.fn();
    const send = jest.fn();
    const handlers = routes[route];
    // Em rotas administrativas os dois primeiros são Firebase e a guarda da plataforma.
    const chain = route.includes('/platform/') ? handlers.slice(2) : handlers;
    for (const handler of chain) await handler({ headers: {}, ...req } as Request, { json, send } as unknown as Response);
    return { json, send };
  }
  return { contentRepository, testimonialRepository, routes, admin, run };
}

const validContent = {
  features: [{ text: 'Impressão automática' }],
  howItWorks: [{ title: 'Cardápio', description: 'Online', mediaType: 'youtube', mediaUrl: 'https://youtu.be/dQw4w9WgXcQ' }],
  clients: [{ companyName: 'Domino', description: 'Rede', imageUrl: 'https://cdn.example.com/a.png' }],
  company: { legalName: 'BS Ltda', cnpj: '00.000.000/0001-00' },
};

describe('LandingContentController - 0183', () => {
  it('rotas administrativas passam por Firebase e pela guarda da plataforma; as públicas não', () => {
    const { routes } = setup();
    for (const route of ['GET /platform/landing-content', 'PUT /platform/landing-content', 'GET /platform/landing-testimonials',
      'PATCH /platform/landing-testimonials/:id', 'DEL /platform/landing-testimonials/:id', 'POST /platform/landing-content/uploads/presign']) {
      expect(routes[route]).toHaveLength(3);
    }
    expect(routes['GET /landing/public']).toHaveLength(1);
    expect(routes['POST /landing/testimonials']).toHaveLength(1);
  });

  it('home pública vazia devolve listas vazias e só expõe campos públicos dos depoimentos aprovados', async () => {
    const { run, testimonialRepository } = setup();
    expect((await run('GET /landing/public')).json).toHaveBeenCalledWith(200, { ...emptyLandingContent(), testimonials: [] });
    testimonialRepository.list.mockResolvedValueOnce([buildTestimonial({ status: 'approved', rating: 5 })]);
    const { json } = await run('GET /landing/public');
    expect(testimonialRepository.list).toHaveBeenLastCalledWith('approved');
    expect(json.mock.calls[0][1].testimonials).toEqual([
      { id: 't-1', authorName: 'Maria', businessName: 'Pizzaria', city: 'Fortaleza', text: 'Sistema muito bom de usar', rating: 5 },
    ]);
  });

  it('PUT salva o conteúdo preservando a ordem e gerando ids', async () => {
    const { run, contentRepository } = setup();
    const { json } = await run('PUT /platform/landing-content', { body: { ...validContent, features: [{ text: 'B' }, { id: 'keep', text: 'A' }] } });
    const saved = contentRepository.update.mock.calls[0][0];
    expect(saved.features.map((item: { text: string }) => item.text)).toEqual(['B', 'A']);
    expect(saved.features[0].id).toEqual(expect.any(String));
    expect(saved.features[1].id).toBe('keep');
    expect(json).toHaveBeenCalledWith(200, saved);
  });

  it.each([
    ['YouTube inválido', { howItWorks: [{ title: 'x', mediaType: 'youtube', mediaUrl: 'https://example.com/v' }] }],
    ['imagem sem https', { howItWorks: [{ title: 'x', mediaType: 'image', mediaUrl: 'http://a.com/a.png' }] }],
    ['funcionalidade vazia', { features: [{ text: ' ' }] }],
    ['logo com javascript:', { clients: [{ companyName: 'x', imageUrl: 'javascript:alert(1)' }] }],
    ['link de termos inválido', { company: { termsUrl: 'ftp://x' } }],
    ['campo desconhecido', { extra: true }],
  ])('PUT rejeita %s sem salvar', async (_label, patch) => {
    const { run, contentRepository } = setup();
    await expect(run('PUT /platform/landing-content', { body: { ...validContent, ...patch } })).rejects.toMatchObject({ statusCode: 400 });
    expect(contentRepository.update).not.toHaveBeenCalled();
  });

  it('envio público cria depoimento pendente e valida o payload', async () => {
    const { run, testimonialRepository } = setup();
    const body = { authorName: 'Maria', businessName: 'Pizzaria', text: 'Sistema muito bom de usar', rating: 5 };
    const { json } = await run('POST /landing/testimonials', { body });
    expect(json).toHaveBeenCalledWith(201, { received: true });
    expect(testimonialRepository.create).toHaveBeenCalledWith({ ...body, city: '' });
    await expect(run('POST /landing/testimonials', { body: { ...body, text: 'curto' } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run('POST /landing/testimonials', { body: { ...body, rating: 9 } })).rejects.toMatchObject({ statusCode: 400 });
    expect(testimonialRepository.create).toHaveBeenCalledTimes(1);
  });

  it('honeypot preenchido responde 201 sem salvar', async () => {
    const { run, testimonialRepository } = setup();
    const { json } = await run('POST /landing/testimonials', {
      body: { authorName: 'Bot', businessName: 'Bot', text: 'Texto longo o bastante', website: 'http://spam' },
    });
    expect(json).toHaveBeenCalledWith(201, { received: true });
    expect(testimonialRepository.create).not.toHaveBeenCalled();
  });

  it('limita 5 envios por hora por IP', async () => {
    const { run } = setup();
    const body = { authorName: 'Maria', businessName: 'Pizzaria', text: 'Sistema muito bom de usar' };
    const req = { body, headers: { 'x-forwarded-for': '1.2.3.4' } };
    for (let i = 0; i < 5; i += 1) await run('POST /landing/testimonials', req);
    await expect(run('POST /landing/testimonials', req)).rejects.toMatchObject({ statusCode: 429 });
    await expect(run('POST /landing/testimonials', { ...req, headers: { 'x-forwarded-for': '5.6.7.8' } })).resolves.toBeDefined();
  });

  it('moderação: lista com filtro, altera status e exclui; id inexistente dá 404', async () => {
    const { run, testimonialRepository } = setup();
    await run('GET /platform/landing-testimonials', { query: { status: 'pending' } });
    expect(testimonialRepository.list).toHaveBeenCalledWith('pending');
    await expect(run('GET /platform/landing-testimonials', { query: { status: 'x' } })).rejects.toMatchObject({ statusCode: 400 });

    const patched = await run('PATCH /platform/landing-testimonials/:id', { params: { id: 't-1' }, body: { status: 'approved' } });
    expect(testimonialRepository.updateStatus).toHaveBeenCalledWith('t-1', 'approved');
    expect(patched.json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'approved' }));

    const removed = await run('DEL /platform/landing-testimonials/:id', { params: { id: 't-1' } });
    expect(removed.send).toHaveBeenCalledWith(204);

    testimonialRepository.updateStatus.mockResolvedValueOnce(null);
    testimonialRepository.delete.mockResolvedValueOnce(false);
    await expect(run('PATCH /platform/landing-testimonials/:id', { params: { id: 'x' }, body: { status: 'rejected' } })).rejects.toMatchObject({ statusCode: 404 });
    await expect(run('DEL /platform/landing-testimonials/:id', { params: { id: 'x' } })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('presign devolve URL de envio e URL pública sob platform/landing/', async () => {
    const { run } = setup();
    const { json } = await run('POST /platform/landing-content/uploads/presign', { body: { filename: 'Logo.PNG' } });
    const result = json.mock.calls[0][1];
    expect(result.uploadUrl).toBe('https://s3.example.com/upload-url');
    expect(result.publicUrl).toMatch(/\/platform\/landing\/[\w-]+\.png$/);
  });

  // specs/0186 — títulos, fundos e cores por seção, cor do topo e do rodapé.
  const settings = {
    headerColor: '#112233',
    features: { title: 'Vantagens', backgroundColor: '#ffffff', backgroundImageUrl: 'https://cdn.example.com/f.jpg', visible: true },
    howItWorks: { title: 'Passo a passo', backgroundColor: '#F5F2EE', visible: false },
    clients: { title: 'Quem usa', backgroundColor: '', backgroundImageUrl: '', cardColor: '#2b2b2b', textColor: '#FFFFFF', visible: true },
    testimonials: { title: '', backgroundColor: '#f5f2ee', backgroundImageUrl: '', visible: true },
  };

  it('PUT salva as configurações visuais e a cor do rodapé', async () => {
    const { run, contentRepository } = setup();
    await run('PUT /platform/landing-content', {
      body: { ...validContent, company: { ...validContent.company, backgroundColor: '#2A1D14' }, settings },
    });
    const saved = contentRepository.update.mock.calls[0][0];
    expect(saved.settings).toEqual(settings);
    expect(saved.company.backgroundColor).toBe('#2A1D14');
  });

  // Pedido explícito do usuário — cada seção (Funcionalidades, Como funciona, Nossos clientes,
  // Depoimentos, Empresa) ganha um switch pra mostrar/ocultar na home, independente do conteúdo
  // cadastrado; sem informar, assume visível (cliente antigo continua mostrando tudo).
  it('PUT salva "visible" de cada seção; sem informar, assume true', async () => {
    const { run, contentRepository } = setup();
    await run('PUT /platform/landing-content', {
      body: { ...validContent, company: { ...validContent.company, visible: false }, settings },
    });
    const saved = contentRepository.update.mock.calls[0][0];
    expect(saved.company.visible).toBe(false);
    expect(saved.settings.features.visible).toBe(true);
    expect(saved.settings.howItWorks.visible).toBe(false);

    await run('PUT /platform/landing-content', { body: validContent });
    const savedWithoutVisible = contentRepository.update.mock.calls[1][0];
    expect(savedWithoutVisible.company.visible).toBe(true);
  });

  it('PUT sem settings (cliente antigo) mantém as configurações já salvas', async () => {
    const { run, contentRepository } = setup();
    contentRepository.get.mockResolvedValue({ ...emptyLandingContent(), settings });
    await run('PUT /platform/landing-content', { body: validContent });
    expect(contentRepository.update.mock.calls[0][0].settings).toEqual(settings);
  });

  it.each([
    ['cor com formato inválido', { headerColor: 'marrom' }],
    ['cor curta', { clients: { ...settings.clients, cardColor: '#fff' } }],
    ['foto de fundo sem https', { features: { ...settings.features, backgroundImageUrl: 'http://x/a.jpg' } }],
    ['foto de fundo em Como funciona', { howItWorks: { ...settings.howItWorks, backgroundImageUrl: 'https://x/a.jpg' } }],
    ['título longo demais', { testimonials: { ...settings.testimonials, title: 'x'.repeat(121) } }],
  ])('PUT rejeita %s sem salvar', async (_label, patch) => {
    const { run, contentRepository } = setup();
    await expect(
      run('PUT /platform/landing-content', { body: { ...validContent, settings: { ...settings, ...patch } } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(contentRepository.update).not.toHaveBeenCalled();
  });
});
