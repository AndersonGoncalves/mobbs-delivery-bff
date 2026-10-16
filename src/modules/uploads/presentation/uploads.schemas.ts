import { z } from 'zod';

export const presignUploadSchema = z.object({
  kind: z.enum(['logo', 'defaultProductImage', 'product', 'banner', 'additionalGroupOption', 'campaign', 'menuCategory', 'rawMaterial', 'operatorPhoto']),
  filename: z.string().min(1),
});
