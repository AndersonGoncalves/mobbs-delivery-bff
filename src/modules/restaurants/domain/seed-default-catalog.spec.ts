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
    // specs/0049-catalogo-padrao-bebidas-reais REQ-18 — 3ª passada de seedDefaultCatalog.
    update: jest.fn().mockResolvedValue({}),
  } as unknown as IAdditionalGroupTemplateRepository;
  return { menuCategoryRepository, productRepository, additionalGroupTemplateRepository };
}

describe('seedDefaultCatalog', () => {
  it('cria todas as categorias, todos os produtos e todos os grupos de adicionais do tipo de negócio', async () => {
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

  // specs/0049-catalogo-padrao-bebidas-reais REQ-17 — corrige a asserção original (REQ-9,
  // "nenhum produto tem imageUrl nesta v1"): os 12 produtos de bebida (todos com foto real
  // publicada) têm imageUrl, em todos os tipos de negócio — outras categorias podem ou não ter
  // (ex.: as pizzas de "pizzaria" também ganharam foto, fora do escopo desta spec).
  it('os 12 produtos de "Bebidas" têm imageUrl, em todos os tipos de negócio', () => {
    for (const businessType of BUSINESS_TYPES) {
      const bebidas = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories.find((category) => category.categoryName === 'Bebidas');
      for (const product of bebidas!.products) {
        expect(product.imageUrl).toContain('app-imagens/');
      }
    }
  });

  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-11 — "Lanche" virou "Lanches"
  // (ajuste manual do usuário, fora desta spec, mas replicado aqui pra bater com o código real).
  it.each(BUSINESS_TYPES)('AC-11: tipo "%s" tem as categorias na ordem [própria, Lanches, Bebidas, Sobremesas]', (businessType) => {
    const categoryNames = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories.map((category) => category.categoryName);

    expect(categoryNames).toHaveLength(4);
    expect(categoryNames.slice(1)).toEqual(['Lanches', 'Bebidas', 'Sobremesas']);
  });

  // Checagem por posição (não por nome): pro tipo "lanches_gerais", a categoria própria (posição
  // 0) já se chama "Lanches" — desde que "Lanche" virou "Lanches" (ajuste manual do usuário), esse
  // tipo específico fica com 2 categorias de nome igual (achado real, sinalizado à parte). Por
  // posição continua correto: `extraCategories()` sempre entra em [1]="Lanches" (extra, vazia),
  // [2]="Bebidas" (com produtos, REQ-17), [3]="Sobremesas" (vazia) — não depende do nome bater.
  it('AC-11: as categorias extras "Lanches" (posição 2) e "Sobremesas" (posição 4) continuam sem produto nenhum', () => {
    for (const businessType of BUSINESS_TYPES) {
      const categories = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories;
      expect(categories[1].products).toEqual([]);
      expect(categories[3].products).toEqual([]);
    }
  });

  // specs/0049-catalogo-padrao-bebidas-reais REQ-17.
  it('AC-17: "Bebidas" tem os 12 produtos reais, todos availableAsAdditional, pra todos os tipos de negócio', () => {
    for (const businessType of BUSINESS_TYPES) {
      const bebidas = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType].categories.find((category) => category.categoryName === 'Bebidas');

      expect(bebidas?.products).toHaveLength(12);
      for (const product of bebidas!.products) {
        expect(product.availableAsAdditional).toBe(true);
      }
    }
  });

  // specs/0049-catalogo-padrao-bebidas-reais REQ-18/REQ-19.
  it('AC-18/AC-19: template "Refri?" tem as 5 opções vinculadas aos produtos reais, com os preços validados em produção', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.additionalGroupTemplateRepository.update).toHaveBeenCalledWith(
      'agt-Refri?',
      expect.objectContaining({
        options: [
          expect.objectContaining({ name: 'Coca-Cola 1 litro', priceDelta: 10, linkedProductId: 'p-Coca-Cola 1 litro', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Guaraná Antarctica 1 litro', priceDelta: 8, linkedProductId: 'p-Guaraná Antarctica 1 litro', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Fanta Laranja 1 litro', priceDelta: 8, linkedProductId: 'p-Fanta Laranja 1 litro', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Fanta Uva 1 litro', priceDelta: 8, linkedProductId: 'p-Fanta Uva 1 litro', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Sprite 1 litro', priceDelta: 8, linkedProductId: 'p-Sprite 1 litro', imageUrl: expect.stringContaining('app-imagens/') }),
        ],
      }),
    );
  });

  it('AC-18/AC-19: template "Bebidas?" tem as 7 opções vinculadas, "Água indaiá com gás" no preço novo (R$3,50)', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.additionalGroupTemplateRepository.update).toHaveBeenCalledWith(
      'agt-Bebidas?',
      expect.objectContaining({
        options: [
          expect.objectContaining({ name: 'Coca-Cola lata 350ml', linkedProductId: 'p-Coca-Cola lata 350ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Guaraná Antarctica lata 350ml', linkedProductId: 'p-Guaraná Antarctica lata 350ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Fanta Laranja lata 350ml', linkedProductId: 'p-Fanta Laranja lata 350ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Fanta Uva lata 350ml', linkedProductId: 'p-Fanta Uva lata 350ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Sprite lata 350ml', linkedProductId: 'p-Sprite lata 350ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Água indaiá com gás 500ml', priceDelta: 3.5, linkedProductId: 'p-Água indaiá com gás 500ml', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Água indaiá sem gás 500ml', linkedProductId: 'p-Água indaiá sem gás 500ml', imageUrl: expect.stringContaining('app-imagens/') }),
        ],
      }),
    );
  });

  it('templates sem opção vinculada (ex.: "Sabores da Pizza") não chamam additionalGroupTemplateRepository.update', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.additionalGroupTemplateRepository.update).not.toHaveBeenCalledWith('agt-Sabores da Pizza', expect.anything());
    expect(deps.additionalGroupTemplateRepository.update).not.toHaveBeenCalledWith('agt-Tamanho', expect.anything());
  });

  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-12; specs/0049-catalogo-padrao-bebidas-reais REQ-20.
  // Ordem ajustada manualmente pelo usuário (fora desta spec) — "Bordas" primeiro.
  it('AC-12/AC-20: pizzaria ganha "Pizza grande 2 sabores + Refri 1L grátis" vinculado a Bordas + Sabores da Pizza + Refri?', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.productRepository.update).toHaveBeenCalledWith(
      'p-Pizza grande 2 sabores + Refri 1L grátis',
      expect.objectContaining({
        additionalGroups: [
          expect.objectContaining({ productId: 'p-Pizza grande 2 sabores + Refri 1L grátis', templateId: 'agt-Bordas' }),
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

  // Regressão — "Sabores da Pizza" não tem `linkedProductName` nas opções (são texto puro, não
  // vinculadas a um produto), então a 3ª passada do seed (que só resolve `linkedProductId`) nunca
  // toca nesse template — o `imageUrl` precisa chegar já na criação (1ª passada), senão a opção
  // nasce sem foto mesmo com `imageUrl` preenchido no catálogo.
  it('AC-12: o template "Sabores da Pizza" é criado com o imageUrl de cada opção', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'pizzaria', deps);

    expect(deps.additionalGroupTemplateRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({
        name: 'Sabores da Pizza',
        options: [
          expect.objectContaining({ name: 'Mussarela', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Mista', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Calabresa', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Frango', imageUrl: expect.stringContaining('app-imagens/') }),
          expect.objectContaining({ name: 'Carne do Sol', imageUrl: expect.stringContaining('app-imagens/') }),
        ],
      }),
    );
  });

  it('produtos sem linkedAdditionalGroupTemplateNames não chamam productRepository.update', async () => {
    const deps = buildDeps();

    await seedDefaultCatalog('r-1', 'hamburgueria', deps);

    expect(deps.productRepository.update).not.toHaveBeenCalled();
  });
});
