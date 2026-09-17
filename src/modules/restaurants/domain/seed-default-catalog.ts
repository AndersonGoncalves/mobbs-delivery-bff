import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { BusinessType } from './business-type';
import { DEFAULT_CATALOGS_BY_BUSINESS_TYPE } from './default-catalogs-by-business-type';

export interface SeedDefaultCatalogDeps {
  menuCategoryRepository: IMenuCategoryRepository;
  productRepository: IProductRepository;
  additionalGroupTemplateRepository: IAdditionalGroupTemplateRepository;
}

/** specs/0039-onboarding-primeiro-acesso REQ-9 — chamado uma vez, logo após o autocadastro
 * (`RestaurantSignupController`), pra o restaurante já nascer com um catálogo típico do tipo de
 * negócio escolhido, em vez de completamente vazio. */
export async function seedDefaultCatalog(restaurantId: string, businessType: BusinessType, deps: SeedDefaultCatalogDeps): Promise<void> {
  const catalog = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType];

  const category = await deps.menuCategoryRepository.create(restaurantId, catalog.categoryName);

  for (const product of catalog.products) {
    await deps.productRepository.create(restaurantId, {
      menuCategoryId: category.id,
      name: product.name,
      description: product.description,
      price: product.price,
      isAvailable: true,
      additionalGroups: [],
    });
  }

  for (const template of catalog.additionalGroupTemplates) {
    await deps.additionalGroupTemplateRepository.create(restaurantId, {
      name: template.name,
      type: template.type,
      required: template.required,
      minSelections: template.minSelections,
      maxSelections: template.maxSelections,
      options: template.options,
    });
  }
}
