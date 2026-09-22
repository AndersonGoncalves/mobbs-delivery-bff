import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { BUSINESS_TYPES } from './business-type';
import { DEFAULT_CATALOGS_BY_BUSINESS_TYPE } from './default-catalogs-by-business-type';
import { seedDefaultCatalog } from './seed-default-catalog';

function allProducts(businessType: (typeof BUSINESS_TYPES)[number]) {
  return DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories.flatMap((category) => category.products);
}

function buildDeps() {
  const menuCategoryRepository = {
    create: jest.fn().mockImplementation(async (_restaurantId: string, name: string) => ({ id: `c-${name}`, name })),
  } as unknown as IMenuCategoryRepository;
  const productRepository = {
    create: jest.fn().mockImplementation(async (_restaurantId: string, input: Record<string, unknown>) => ({ id: `p-${input.name}`, ...input })),
    update: jest.fn().mockResolvedValue({}),
  } as unknown as IProductRepository;
  const additionalGroupTemplateRepository = {
    create: jest
      .fn()
      .mockImplementation(async (_restaurantId: string, input: Record<string, unknown>) => ({ id: `agt-${input.name}`, ...input })),
  } as unknown as IAdditionalGroupTemplateRepository;
  return { menuCategoryRepository, productRepository, additionalGroupTemplateRepository };
}

describe('seedDefaultCatalog', () => {
  it('cria todas as categorias, todos os produtos (sem imagem) e todos os grupos de adicionais do tipo de negócio', async () => {
    const deps = buildDeps();
    const catalog = DEFAULT_CATALOGS_BY_BUSINESS_TYPE.pizzaria;

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    for (const category of catalog.categories) {
      expect(deps.menuCategoryRepository.create).toHaveBeenCalledWith('r-1', category.categoryName);
    }
    expect(deps.productRepository.create).toHaveBeenCalledTimes(allProducts('pizzaria').length);
    for (const product of allProducts('pizzaria')) {
      expect(deps.productRepository.create).toHaveBeenCalledWith(
        'r-1',
        expect.objectContaining({ name: product.name, price: product.price, isAvailable: true, additionalGroups: [] }),
      );
    }
    expect(deps.additionalGroupTemplateRepository.create).toHaveBeenCalledTimes(catalog.additionalGroupTemplates.length);
  });

  it.each(BUSINESS_TYPES)('tipo "%s" tem um catálogo definido, com ao menos 1 produto', async (businessType) => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', businessType, deps);

    expect(allProducts(businessType).length).toBeGreaterThan(0);
    expect(deps.productRepository.create).toHaveBeenCalledTimes(allProducts(businessType).length);
  });

  it('nenhum produto do catálogo inicial tem imageUrl (REQ-9 — sem foto nesta v1)', () => {
    for (const businessType of BUSINESS_TYPES) {
      for (const product of allProducts(businessType)) {
        expect(product).not.toHaveProperty('imageUrl');
      }
    }
  });

  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-11.
  it.each(BUSINESS_TYPES)('AC-11: tipo "%s" tem as categorias na ordem [própria, Lanche, Bebidas, Sobremesas]', (businessType) => {
    const categoryNames = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories.map((category) => category.categoryName);

    expect(categoryNames).toHaveLength(4);
    expect(categoryNames.slice(1)).toEqual(['Lanche', 'Bebidas', 'Sobremesas']);
  });

  it('AC-11: as 3 categorias novas nascem sem produto nenhum, pra todos os tipos', () => {
    for (const businessType of BUSINESS_TYPES) {
      const [, ...extraCategories] = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories;
      for (const category of extraCategories) {
        expect(category.products).toEqual([]);
      }
    }
  });

  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-12.
  it('AC-12: pizzaria ganha "Pizza grande 2 sabores + Refri 1L grátis" vinculado a Sabores da Pizza + Refri?', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.productRepository.update).toHaveBeenCalledWith(
      'p-Pizza grande 2 sabores + Refri 1L grátis',
      expect.objectContaining({
        additionalGroups: [
          expect.objectContaining({ productId: 'p-Pizza grande 2 sabores + Refri 1L grátis', templateId: 'agt-Sabores da Pizza' }),
          expect.objectContaining({ productId: 'p-Pizza grande 2 sabores + Refri 1L grátis', templateId: 'agt-Refri?' }),
        ],
      }),
    );
  });

  it('AC-12: o template "Sabores da Pizza" tem min 2, max 2 e as 5 opções pedidas', () => {
    const template = DEFAULT_CATALOGS_BY_BUSINESS_TYPE.pizzaria.additionalGroupTemplates.find((t) => t.name === 'Sabores da Pizza');

    expect(template?.required).toBe(true);
    expect(template?.minSelections).toBe(2);
    expect(template?.maxSelections).toBe(2);
    expect(template?.options.map((option) => option.name)).toEqual(['Mussarela', 'Mista', 'Calabresa', 'Frango', 'Carne do Sol']);
  });

  it('produtos sem linkedAdditionalGroupTemplateNames não chamam productRepository.update', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'hamburgueria', deps);

    expect(deps.productRepository.update).not.toHaveBeenCalled();
  });
});
