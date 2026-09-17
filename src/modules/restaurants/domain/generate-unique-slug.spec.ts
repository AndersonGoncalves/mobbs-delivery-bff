import { IRestaurantRepository } from './repositories/restaurant.repository.interface';
import { generateUniqueSlug } from './generate-unique-slug';

function buildRepository(overrides: Partial<IRestaurantRepository> = {}): IRestaurantRepository {
  return {
    findBySlug: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as IRestaurantRepository;
}

describe('generateUniqueSlug', () => {
  it('gera o slug a partir do nome (minúsculo, sem acento, espaço -> hífen)', async () => {
    const repository = buildRepository();

    expect(await generateUniqueSlug('Pizzaria do João', repository)).toBe('pizzaria-do-joao');
  });

  it('AC-3: se o slug já existir, gera uma variação com sufixo numérico automaticamente', async () => {
    const repository = buildRepository({
      findBySlug: jest.fn().mockImplementation(async (slug: string) => (slug === 'pizzaria-do-joao' ? { id: '1' } : null)),
    });

    expect(await generateUniqueSlug('Pizzaria do João', repository as unknown as IRestaurantRepository)).toBe(
      'pizzaria-do-joao-2',
    );
  });

  it('tenta sufixos crescentes até achar um slug livre', async () => {
    const taken = new Set(['pizzaria-do-joao', 'pizzaria-do-joao-2', 'pizzaria-do-joao-3']);
    const repository = buildRepository({
      findBySlug: jest.fn().mockImplementation(async (slug: string) => (taken.has(slug) ? { id: '1' } : null)),
    });

    expect(await generateUniqueSlug('Pizzaria do João', repository as unknown as IRestaurantRepository)).toBe(
      'pizzaria-do-joao-4',
    );
  });

  it('nome que colide com um caminho reservado (ex. "Painel") também gera sufixo, não o reservado puro', async () => {
    const repository = buildRepository();

    expect(await generateUniqueSlug('Painel', repository)).toBe('painel-2');
  });

  it('nome vazio de caracteres válidos cai no fallback "restaurante"', async () => {
    const repository = buildRepository();

    expect(await generateUniqueSlug('!!!', repository)).toBe('restaurante');
  });
});
