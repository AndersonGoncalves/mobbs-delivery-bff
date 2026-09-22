import { randomUUID } from 'crypto';

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
 * negócio escolhido, em vez de completamente vazio.
 *
 * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-11/REQ-12 — os templates de
 * adicionais são criados **antes** das categorias/produtos (ordem invertida da versão original),
 * porque o produto especial de pizzaria (`linkedAdditionalGroupTemplateNames`) precisa dos ids
 * reais dos templates pra montar seu `additionalGroups` como referência (`templateId`), não como
 * grupo inline. Os demais produtos do seed continuam nascendo com `additionalGroups: []`, igual
 * antes — o script continua sem vincular automaticamente por padrão (decisão confirmada com o
 * usuário), só o produto explicitamente marcado no catálogo ganha o vínculo. */
export async function seedDefaultCatalog(restaurantId: string, businessType: BusinessType, deps: SeedDefaultCatalogDeps): Promise<void> {
  const catalog = DEFAULT_CATALOGS_BY_BUSINESS_TYPE[businessType];

  const templateIdsByName = new Map<string, string>();
  for (const template of catalog.additionalGroupTemplates) {
    const created = await deps.additionalGroupTemplateRepository.create(restaurantId, {
      name: template.name,
      type: template.type,
      required: template.required,
      minSelections: template.minSelections,
      maxSelections: template.maxSelections,
      options: template.options,
    });
    templateIdsByName.set(template.name, created.id);
  }

  for (const { categoryName, products } of catalog.categories) {
    const category = await deps.menuCategoryRepository.create(restaurantId, categoryName);

    for (const product of products) {
      const created = await deps.productRepository.create(restaurantId, {
        menuCategoryId: category.id,
        name: product.name,
        description: product.description,
        price: product.price,
        isAvailable: true,
        additionalGroups: [],
      });

      const templateNames = product.linkedAdditionalGroupTemplateNames ?? [];
      if (templateNames.length === 0) continue;

      // Precisa de um 2º `update` (em vez de já criar com `additionalGroups` preenchido) porque
      // as referências exigem o `productId` do produto recém-criado (`IProductAdditionalGroupReference`).
      await deps.productRepository.update(created.id, {
        additionalGroups: templateNames
          .map((name) => templateIdsByName.get(name))
          .filter((templateId): templateId is string => templateId !== undefined)
          .map((templateId) => ({ id: randomUUID(), productId: created.id, templateId })),
      });
    }
  }
}
