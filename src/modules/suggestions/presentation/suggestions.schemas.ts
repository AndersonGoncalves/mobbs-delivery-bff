import { z } from 'zod';
import { suggestionStatuses } from '../domain/suggestion';

export const suggestionIdSchema = z.string().uuid();
export const createSuggestionSchema = z.object({
  title: z.string().trim().min(3, 'Informe um título com pelo menos 3 caracteres.').max(150, 'Use no máximo 150 caracteres no título.'),
  description: z.string().trim().min(10, 'Descreva sua sugestão com pelo menos 10 caracteres.').max(5000, 'Use no máximo 5000 caracteres na descrição.'),
}).strict();
export const listSuggestionsSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(suggestionStatuses).optional(),
});
export const updateSuggestionSchema = z.object({
  status: z.enum(suggestionStatuses),
  reply: z.string().trim().max(5000, 'Use no máximo 5000 caracteres na resposta.').default(''),
  revision: z.number().int().min(0),
}).strict();
export const readSuggestionSchema = z.object({ revision: z.number().int().min(0) }).strict();
