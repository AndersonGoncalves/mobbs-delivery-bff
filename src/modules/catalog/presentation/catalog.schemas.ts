import { z } from 'zod';

import { IProductAdditionalGroup, IProductAdditionalOption } from '../domain/entities/product.entity';

// specs/0007-cadastro-produtos REQ-1.
export const menuCategoryNameSchema = z.object({ name: z.string().min(1) });

export const reorderMenuCategoriesSchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1) });

// REQ-6: árvore recursiva de adicionais (produto composto, arquétipo 4) — precisa de `z.lazy()`.
// `nestedAdditionalGroups` sempre usa `productAdditionalGroupInlineSchema` (nunca a referência de
// template) — specs/0025-adicionais-reutilizaveis-remocao, templates só valem pra grupos de 1º
// nível (plan.md §Arquitetura da solução).
const productAdditionalOptionSchema: z.ZodType<IProductAdditionalOption> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    groupId: z.string().min(1),
    name: z.string().min(1),
    priceDelta: z.number(),
    rawMaterialId: z.string().min(1).optional(),
    nestedAdditionalGroups: z.array(productAdditionalGroupInlineSchema).default([]),
  }),
);

// specs/0025-adicionais-reutilizaveis-remocao REQ-8/REQ-10 — `type` distingue "adicionar"
// (padrão, opções custam extra) de "remover" (opções excluem um ingrediente padrão do produto,
// sempre `priceDelta: 0`).
const productAdditionalGroupInlineSchema: z.ZodType<IProductAdditionalGroup> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      productId: z.string().min(1),
      name: z.string().min(1),
      type: z.enum(['adicionar', 'remover']).default('adicionar'),
      required: z.boolean(),
      minSelections: z.number().int().nonnegative(),
      maxSelections: z.number().int().positive(),
      options: z.array(productAdditionalOptionSchema).default([]),
    })
    .superRefine((data, ctx) => {
      if (data.type !== 'remover') return;
      data.options.forEach((option, index) => {
        if (option.priceDelta !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['options', index, 'priceDelta'],
            message: 'Opção de grupo "remover" não pode ter preço adicional diferente de 0',
          });
        }
      });
    }),
);

// REQ-2/REQ-3 — grupo **vinculado** a um `AdditionalGroupTemplate`. Bug real corrigido aqui: o
// `AdditionalGroupBuilder.tsx` (web) manda `templateId` JUNTO com os campos resolvidos (nome/
// opções/etc — pra já mostrar o preview antes de salvar), não só os 3 campos da referência. Sem
// `.strict()` (e verificado ANTES do schema inline no `z.union`), qualquer objeto com `templateId`
// válido cai aqui — os campos extras (nome/opções resolvidos) são ignorados/descartados no parse,
// o que é o comportamento certo: quem manda a verdade pra um grupo vinculado é sempre o template,
// nunca o que o cliente mandou. Com `.strict()` (versão anterior), um payload com campos extras
// falhava essa branch e caía no schema inline — que não tem `templateId` no shape e descarta
// esse campo ao validar, perdendo o vínculo silenciosamente no primeiro salvamento.
const productAdditionalGroupReferenceSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  templateId: z.string().min(1),
});

const productAdditionalGroupSchema = z.union([productAdditionalGroupReferenceSchema, productAdditionalGroupInlineSchema]);

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

// specs/0026-selecao-clonar-excluir-busca-web REQ-7 — query params chegam sempre como string.
export const listProductsQuerySchema = z.object({
  name: z.string().min(1).optional(),
  isAvailable: z.enum(['true', 'false']).optional(),
});
