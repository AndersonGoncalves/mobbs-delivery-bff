import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { BUSINESS_TYPES } from './business-type';
import { DEFAULT_CATALOGS_BY_BUSINESS_TYPE } from './default-catalogs-by-business-type';
import { seedDefaultCatalog } from './seed-default-catalog';

function buildDeps() {
  const menuCategoryRepository = { create: jest.fn().mockResolvedValue({ id: 'c-1' }) } as unknown as IMenuCategoryRepository;
  const productRepository = { create: jest.fn().mockResolvedValue({ id: 'p-1' }) } as unknown as IProductRepository;
  const additionalGroupTemplateRepository = { create: jest.fn().mockResolvedValue({ id: 'agt-1' }) } as unknown as IAdditionalGroupTemplateRepository;
  return { menuCategoryRepository, productRepository, additionalGroupTemplateRepository };
}

describe('seedDefaultCatalog', () => {
  it('cria a categoria, todos os produtos (sem imagem) e todos os grupos de adicionais do tipo de negócio', async () => {
    const deps = buildDeps();
    const catalog = DEFAULT_CATALOGS_BY_BUSINESS_TYPE.pizzaria;

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.menuCategoryRepository.create).toHaveBeenCalledWith('r-1', catalog.categoryName);
    expect(deps.productRepository.create).toHaveBeenCalledTimes(catalog.products.length);
    for (const product of catalog.products) {
      expect(deps.productRepository.create).toHaveBeenCalledWith(
        'r-1',
        expect.objectContaining({ menuCategoryId: 'c-1', name: product.name, price: product.price, isAvailable: true, additionalGroups: [] }),
      );
    }
    expect(deps.additionalGroupTemplateRepository.create).toHaveBeenCalledTimes(catalog.additionalGroupTemplates.length);
  });

  it.each(BUSINESS_TYPES)('tipo "%s" tem um catálogo definido, com ao menos 1 produto', async (businessType) => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', businessType, deps);

    const catalog = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType];
    expect(catalog.products.length).toBeGreaterThan(0);
    expect(deps.productRepository.create).toHaveBeenCalledTimes(catalog.products.length);
  });

  it('nenhum produto do catálogo inicial tem imageUrl (REQ-9 — sem foto nesta v1)', () => {
    for (const businessType of BUSINESS_TYPES) {
      for (const product of DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].products) {
        expect(product).not.toHaveProperty('imageUrl');
      }
    }
  });
});
