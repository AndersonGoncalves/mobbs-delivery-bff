import { IResellerProspect } from '../entities/reseller-prospect.entity';

export interface IResellerProspectRepository {
  create(input: { resellerId: string; establishmentName: string; phone?: string; address?: string; notes?: string }): Promise<IResellerProspect>;
  findById(id: string): Promise<IResellerProspect | null>;
  /** REQ-5 — só os do revendedor logado, mais recente primeiro. */
  listByReseller(resellerId: string): Promise<IResellerProspect[]>;
  /** plan.md decisão 2 — só enquanto `em_prospeccao`; `null` se não encontrado ou já convertido. */
  update(id: string, resellerId: string, input: { establishmentName: string; phone?: string; address?: string; notes?: string }): Promise<IResellerProspect | null>;
  /** plan.md decisão 2 — idem; `true` se apagou. */
  delete(id: string, resellerId: string): Promise<boolean>;
  /** REQ-8 — marca como `convertido`, vinculado ao restaurante escolhido. */
  markConverted(id: string, resellerId: string, convertedRestaurantId: string): Promise<IResellerProspect | null>;
}
