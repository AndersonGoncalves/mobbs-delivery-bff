import { z } from 'zod';
import { PROSPECT_CATEGORY_VALUES } from '../domain/prospect-categories';

/** REQ-5 — raio máximo aceito pela Google Places API (New) `searchNearby`. */
const MAX_RADIUS_METERS = 50000;

export const searchProspectsQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().positive().max(MAX_RADIUS_METERS),
  category: z.enum(PROSPECT_CATEGORY_VALUES as [string, ...string[]]),
});

const saveProspectItemSchema = z.object({
  placeId: z.string().min(1),
  establishmentName: z.string().min(1),
  category: z.enum(PROSPECT_CATEGORY_VALUES as [string, ...string[]]),
  phone: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rating: z.number().min(0).max(5).optional(),
});

/** REQ-6 — salva um ou mais resultados selecionados de uma vez. */
export const saveProspectsSchema = z.object({
  items: z.array(saveProspectItemSchema).min(1, 'Selecione ao menos um estabelecimento'),
});

export const listProspectsQuerySchema = z.object({
  category: z.enum(PROSPECT_CATEGORY_VALUES as [string, ...string[]]).optional(),
});
