import { IProspect } from '../entities/prospect.entity';

export interface ProspectInput {
  placeId: string;
  establishmentName: string;
  category: string;
  phone?: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating?: number;
}

export interface IProspectRepository {
  /** REQ-7 — mais recente primeiro; `category` filtra quando informado. */
  listAll(category?: string): Promise<IProspect[]>;
  /** REQ-9 — chave de deduplicação antes de criar. */
  findByPlaceId(placeId: string): Promise<IProspect | null>;
  create(input: ProspectInput): Promise<IProspect>;
  /** specs/0124-campanha-whatsapp-prospects — usado por `ProspectOutreachService` pra resolver o
   * telefone/nome de cada prospect selecionado antes de enviar. */
  findById(id: string): Promise<IProspect | null>;
  /** specs/0124-campanha-whatsapp-prospects REQ-7/REQ-9 — grava a data do envio bem-sucedido;
   * chamado de novo num reenvio, sem criar histórico (sobrescreve). */
  markContacted(id: string, contactedAt: string): Promise<void>;
}
