import { z } from 'zod';

const additionalGroupTemplateOptionSchema = z
  .object({
    name: z.string().min(1),
    // specs/0044-promocoes-produtos (follow-up) — obrigatório quando NÃO tem
    // `linkedProductId`; deve vir ausente quando TEM, porque nesse caso o preço é sempre
    // resolvido "ao vivo" a partir do produto vinculado, nunca armazenado (validado abaixo).
    priceDelta: z.number().optional(),
    rawMaterialId: z.string().min(1).optional(),
    // specs/0041-item-adicional-vinculado-produto REQ-1/REQ-2 — mesma regra de
    // `catalog.schemas.ts` (mutuamente exclusivo com `rawMaterialId`).
    linkedProductId: z.string().min(1).optional(),
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — corrige
    // `specs/0029` REQ-3: a foto é da opção, não do template/grupo inteiro.
    imageUrl: z.string().url().optional(),
  })
  .refine((data) => !(data.rawMaterialId && data.linkedProductId), {
    message: 'Uma opção não pode ter rawMaterialId e linkedProductId ao mesmo tempo',
    path: ['linkedProductId'],
  })
  .refine((data) => data.linkedProductId || data.priceDelta !== undefined, {
    message: 'priceDelta é obrigatório quando a opção não tem linkedProductId',
    path: ['priceDelta'],
  })
  .refine((data) => !data.linkedProductId || data.priceDelta === undefined, {
    message: 'priceDelta não deve ser enviado quando a opção tem linkedProductId (preço é resolvido do produto vinculado)',
    path: ['priceDelta'],
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
    if (data.type === 'remover') {
      data.options.forEach((option, index) => {
        if (option.priceDelta !== undefined && option.priceDelta !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['options', index, 'priceDelta'],
            message: 'Opção de grupo "remover" não pode ter preço adicional diferente de 0',
          });
        }
      });
    }

    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-15 — mesma checagem de
    // `catalog.schemas.ts` (grupo inline de produto).
    if (data.options.length < data.maxSelections) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSelections'],
        message: 'Máx. seleções não pode ser maior que a quantidade de opções cadastradas',
      });
    }

    // `required` é decorativo pra quem consome (app/web só leem `minSelections` pra saber se o
    // grupo pode ficar vazio) — sem essa checagem, um grupo `required: true, minSelections: 0`
    // (bug real já visto em dado legado) mostra "Obrigatório" na UI mas nunca bloqueia salvar sem
    // seleção nenhuma.
    if (data.required && data.minSelections < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelections'],
        message: 'Grupo obrigatório precisa de Min. seleções >= 1',
      });
    }
    if (!data.required && data.minSelections >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['required'],
        message: 'Min. seleções >= 1 exige que o grupo esteja marcado como obrigatório',
      });
    }
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
