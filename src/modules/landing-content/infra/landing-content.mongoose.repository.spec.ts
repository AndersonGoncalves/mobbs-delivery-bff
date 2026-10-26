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
      company: { legalName: 'BS' },
    });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(LandingContentModel, 'findById').mockReturnValue(query);
    const result = await new LandingContentMongooseRepository().get();
    expect(result.features).toEqual([{ id: 'b', text: 'B' }, { id: 'a', text: 'A' }]);
    expect(result.company).toEqual({ ...emptyLandingContent().company, legalName: 'BS' });
    expect(result).not.toHaveProperty('_id');
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
      settings: { headerColor: '#112233', clients: { cardColor: '#000000' }, features: { title: 'Vantagens' } },
    }).toObject();
    jest.spyOn(query, 'lean').mockResolvedValue(withSettings);
    const { settings } = await new LandingContentMongooseRepository().get();
    expect(settings.headerColor).toBe('#112233');
    expect(settings.features).toEqual({ title: 'Vantagens', backgroundColor: '', backgroundImageUrl: '', visible: true });
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
