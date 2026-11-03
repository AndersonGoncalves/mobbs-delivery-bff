import { emptyLandingContent } from '../domain/landing-content';
import { LANDING_CONTENT_SINGLETON_ID, LandingContentModel, LandingTestimonialModel } from './landing-content.mongoose.model';
import { LandingContentMongooseRepository, LandingTestimonialMongooseRepository } from './landing-content.mongoose.repository';

describe('LandingContentMongooseRepository - 0183', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sem documento devolve conteúdo vazio', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    jest.spyOn(query, 'lean').mockResolvedValue(null);
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    expect(await new LandingContentMongooseRepository().get()).toEqual(emptyLandingContent());
  });

  it('lê a ordem persistida sem metadados', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      features: [{ id: 'b', text: 'B' }, { id: 'a', text: 'A' }],
      clients: [{ id: 'c1', companyName: 'Domino', linkUrl: 'https://bsdelivery.com.br/domino' }],
      company: { legalName: 'BS' },
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.features).toEqual([{ id: 'b', text: 'B', group: '' }, { id: 'a', text: 'A', group: '' }]);
    expect(result.clients[0].linkUrl).toBe('https://bsdelivery.com.br/domino');
    expect(result.company).toEqual({ ...emptyLandingContent().company, legalName: 'BS' });
    expect(result).not.toHaveProperty('_id');
  });

  // Pedido explícito do usuário — agrupa funcionalidades relacionadas na home.
  it('lê o grupo de cada funcionalidade quando presente', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      features: [{ id: 'a', text: 'Pix automatizado', group: 'Pagamento' }, { id: 'b', text: 'Sem grupo' }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.features).toEqual([
      { id: 'a', text: 'Pix automatizado', group: 'Pagamento' },
      { id: 'b', text: 'Sem grupo', group: '' },
    ]);
  });

  // Pedido explícito do usuário — cadastro próprio de cada grupo (cor do card + imagem de topo).
  it('lê o cadastro de grupos de funcionalidades, com cor e imagem padrão quando ausentes', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      featureGroups: [{ id: 'g1', name: 'Pagamento', backgroundColor: '#2b303b', imageUrl: 'https://cdn.example.com/pagamento.jpg' }, { id: 'g2', name: 'Cozinha' }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.featureGroups).toEqual([
      { id: 'g1', name: 'Pagamento', backgroundColor: '#2b303b', imageUrl: 'https://cdn.example.com/pagamento.jpg' },
      { id: 'g2', name: 'Cozinha', backgroundColor: '', imageUrl: '' },
    ]);
  });

  // Pedido explícito do usuário — seção "Perguntas Frequentes" (pergunta/resposta em acordeão).
  it('lê as perguntas frequentes cadastradas', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      faq: [{ id: 'q1', question: 'Como funciona?', answer: 'É simples.' }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.faq).toEqual([{ id: 'q1', question: 'Como funciona?', answer: 'É simples.' }]);
  });

  // Pedido explícito do usuário — card de planos (preço mensal/anual + funcionalidades).
  it('lê os planos cadastrados, com padrões quando ausentes', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      pricingPlans: [{ id: 'p1', name: 'Essencial', monthlyPriceCents: 16_900, annualMonthlyPriceCents: 9_900 }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.pricingPlans).toEqual([
      { id: 'p1', name: 'Essencial', description: '', billingTier: 'custom', monthlyPriceCents: 16_900, annualMonthlyPriceCents: 9_900, highlighted: false, features: [] },
    ]);
  });

  // Pedido explícito do usuário — plano ligado a uma faixa real de cobrança (preço calculado, não digitado).
  it('lê o billingTier de um plano ligado a uma faixa real de cobrança', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      pricingPlans: [{ id: 'p1', name: 'Pro', billingTier: 'pro', monthlyPriceCents: 0, annualMonthlyPriceCents: 0 }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.pricingPlans[0].billingTier).toBe('pro');
  });

  // Pedido explícito do usuário — bloco título + descrição + imagem, com botões de contato opcionais.
  it('lê os blocos de destaque (promoBlocks) cadastrados, com padrões quando ausentes', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const doc = new LandingContentModel({
      _id: 'singleton',
      promoBlocks: [{ id: 'b1', title: 'Suporte', imagePosition: 'left', buttons: [{ label: 'Chat', url: 'https://wa.me/5511999999999', icon: 'whatsapp' }] }],
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.promoBlocks).toEqual([{
      id: 'b1', title: 'Suporte', description: '', imageUrl: '', imagePosition: 'left', backgroundColor: '',
      buttons: [{ label: 'Chat', url: 'https://wa.me/5511999999999', icon: 'whatsapp' }],
    }]);
  });

  // specs/0186 — documento salvo antes das configurações visuais continua legível, com padrões vazios.
  it('documento antigo sem settings devolve configurações vazias; com settings, mescla campo a campo', async () => {
    const query = LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID);
    const legacy = new LandingContentModel({ _id: 'singleton' }).toObject();
    delete (legacy as { settings?: unknown }).settings;
    jest.spyOn(query, 'lean').mockResolvedValue(legacy);
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    expect((await new LandingContentMongooseRepository().get()).settings).toEqual(emptyLandingContent().settings);

    const withSettings = new LandingContentModel({
      _id: 'singleton',
      settings: { headerColor: '#112233', clients: { cardColor: '#000000' }, features: { title: 'Vantagens', cardColor: '#2b303b' } },
    }).toObject();
    jest.spyOn(query, 'lean').mockResolvedValue(withSettings);
    const { settings } = await new LandingContentMongooseRepository().get();
    expect(settings.headerColor).toBe('#112233');
    expect(settings.features).toEqual({ title: 'Vantagens', backgroundColor: '', backgroundImageUrl: '', cardColor: '#2b303b', visible: true });
    expect(settings.clients).toEqual({ title: '', backgroundColor: '', backgroundImageUrl: '', cardColor: '#000000', textColor: '', visible: true });
    expect(settings.howItWorks).toEqual({ title: '', backgroundColor: '', visible: true });
  });

  it('faz upsert validado no singleton', async () => {
    const update = jest.spyOn(LandingContentModel, 'findByIdAndUpdate').mockResolvedValue(null);
    const content = emptyLandingContent();
    await new LandingContentMongooseRepository().update(content);
    expect(update).toHaveBeenCalledWith('singleton', { $set: content }, { upsert: true, runValidators: true });
  });
});

describe('LandingTestimonialMongooseRepository - 0183', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lista filtrando por status', async () => {
    const lean = jest.fn().mockResolvedValue([
      new LandingTestimonialModel({ authorName: 'Maria', businessName: 'Pizzaria', text: 'Muito bom', status: 'approved', rating: 4 }).toObject(),
    ]);
    const find = jest.spyOn(LandingTestimonialModel, 'find').mockReturnValue({ sort: () => ({ limit: () => ({ lean }) }) } as never);
    const [item] = await new LandingTestimonialMongooseRepository().list('approved');
    expect(find).toHaveBeenCalledWith({ status: 'approved' });
    expect(item).toMatchObject({ authorName: 'Maria', status: 'approved', rating: 4, city: '' });
  });

  it('exclui e informa se existia', async () => {
    const del = jest.spyOn(LandingTestimonialModel, 'deleteOne');
    del.mockResolvedValueOnce({ deletedCount: 1 } as never).mockResolvedValueOnce({ deletedCount: 0 } as never);
    const repository = new LandingTestimonialMongooseRepository();
    expect(await repository.delete('a')).toBe(true);
    expect(await repository.delete('b')).toBe(false);
  });
});
