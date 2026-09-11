import { z } from 'zod';

const additionalGroupTemplateOptionSchema = z.object({
  name: z.string().min(1),
  priceDelta: z.number(),
  rawMaterialId: z.string().min(1).optional(),
});

// specs/0025-adicionais-reutilizaveis-remocao REQ-1/REQ-8/REQ-10 — grupo reutilizável, sem
// recursão (templates não se aplicam a `nestedAdditionalGroups`, ver plan.md §Arquitetura da
// solução). REQ-10: opção de grupo `type: 'remover'` nunca tem `priceDelta` diferente de 0.
export const saveAdditionalGroupTemplateSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['adicionar', 'remover']).default('adicionar'),
    required: z.boolean(),
    minSelections: z.number().int().nonnegative(),
    maxSelections: z.number().int().positive(),
    options: z.array(additionalGroupTemplateOptionSchema).default([]),
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
  });

export const setAdditionalGroupTemplateActiveSchema = z.object({
  isActive: z.boolean(),
  confirmed: z.boolean().optional(),
});

// specs/0026-selecao-clonar-excluir-busca-web REQ-7 — query params chegam sempre como string.
export const listAdditionalGroupTemplatesQuerySchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
