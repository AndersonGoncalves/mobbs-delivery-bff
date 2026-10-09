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
}
