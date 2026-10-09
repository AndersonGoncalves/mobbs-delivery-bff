/**
 * docs/architecture/data-model.md (nova) §Prospect — specs/0123-prospeccao-restaurantes-google-maps
 * REQ-6/REQ-7. Não é escopado por restaurante (é da plataforma, não de um restaurante cliente).
 * `placeId` é o ID do Google Place — chave de deduplicação (REQ-9).
 */
export interface IProspect {
  id: string;
  placeId: string;
  establishmentName: string;
  /** `ProspectCategory.value` (`domain/prospect-categories.ts`) — o ramo buscado no momento da captura. */
  category: string;
  phone?: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  /**
   * [NEEDS CLARIFICATION] da spec, resolvido: a Google Places API não devolve nome de pessoa —
   * campo preenchido manualmente depois (edição do prospect salvo), nunca vindo da busca.
   */
  contactName?: string;
  /** specs/0124-campanha-whatsapp-prospects REQ-4/REQ-7 — data/hora do último envio de mensagem
   * de abordagem bem-sucedido; ausente = nunca contatado. Reenviar sobrescreve (REQ-9), não
   * acumula histórico. */
  lastContactedAt?: string;
  createdAt: string;
}
