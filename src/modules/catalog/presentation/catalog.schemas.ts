import { z } from 'zod';

import { IProductAdditionalGroup, IProductAdditionalOption } from '../domain/entities/product.entity';

// specs/0007-cadastro-produtos REQ-1.
export const menuCategoryNameSchema = z.object({ name: z.string().min(1) });

export const reorderMenuCategoriesSchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

// REQ-6: árvore recursiva de adicionais (produto composto, arquétipo 4) — precisa de `z.lazy()`.
const productAdditionalOptionSchema: z.ZodType<IProductAdditionalOption> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    groupId: z.string().min(1),
    name: z.string().min(1),
    priceDelta: z.number(),
    rawMaterialId: z.string().min(1).optional(),
    nestedAdditionalGroups: z.array(productAdditionalGroupSchema).default([]),
  }),
);

const productAdditionalGroupSchema: z.ZodType<IProductAdditionalGroup> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    productId: z.string().min(1),
    name: z.string().min(1),
    required: z.boolean(),
    minSelections: z.number().int().nonnegative(),
    maxSelections: z.number().int().positive(),
    options: z.array(productAdditionalOptionSchema).default([]),
  }),
);

// REQ-4: preço e categoria válida são obrigatórios pra salvar — validados aqui, nunca só no
// formulário do lado do cliente (mesma regra de "nunca confiar só no client" de outras specs).
export const saveProductSchema = z.object({
  menuCategoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  price: z.number().positive(),
  isAvailable: z.boolean().default(true),
  additionalGroups: z.array(productAdditionalGroupSchema).default([]),
});

export const updateProductSchema = saveProductSchema.partial();

export const setProductAvailableSchema = z.object({ isAvailable: z.boolean() });
