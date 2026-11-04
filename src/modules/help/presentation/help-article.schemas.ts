import { z } from 'zod';
import { helpAudiences } from '../domain/help-article';

export const listHelpArticlesSchema = z.object({
  audience: z.enum(helpAudiences),
}).strict();
