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
