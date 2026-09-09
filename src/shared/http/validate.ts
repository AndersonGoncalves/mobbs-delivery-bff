import type { ZodType } from 'zod';
import { BadRequestError } from 'restify-errors';

// patterns.md §16.7 — validação de payload via zod, mesmo lugar da referência (início do
// handler, antes de chamar o repositório), só trocando os `if`s manuais por um schema.
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError(result.error.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}
