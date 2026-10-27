/** specs/0189-painel-revenda REQ-5/REQ-6/plan.md decisão 2 — "convertido" é terminal: uma vez
 * convertido, o prospect vira registro histórico (sem mais edição/exclusão pela própria API). */
export type ResellerProspectStatus = 'em_prospeccao' | 'convertido';

/**
 * Lead cadastrado manualmente por um `Reseller` — não confundir com `IProspect`
 * (`modules/prospects`), capturado pelo time da própria Mobbs via Google Places, sem dono. Campos
 * espelham `IProspect` nos nomes que fazem sentido aqui (`establishmentName`/`phone`/`address`),
 * mais `notes` livre — coleção própria e separada, sem nenhuma relação entre as duas.
 */
export interface IResellerProspect {
  id: string;
  resellerId: string;
  establishmentName: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: ResellerProspectStatus;
  /** Preenchido quando `status === 'convertido'` (plan.md — conversão manual, REQ-8). */
  convertedRestaurantId?: string;
  createdAt: Date;
}
