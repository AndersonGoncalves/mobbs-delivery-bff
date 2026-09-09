import { IAddress } from '../entities/customer.entity';

export type NewAddressInput = Omit<IAddress, 'id' | 'customerId' | 'isDefault'>;
export type AddressUpdateInput = Partial<NewAddressInput>;

export interface IAddressRepository {
  listByCustomer(customerId: string): Promise<IAddress[]>;

  findById(id: string): Promise<IAddress | null>;

  /** REQ-6 (`specs/0011-perfil-cliente`) — primeiro endereço do cliente já nasce padrão. */
  create(customerId: string, input: NewAddressInput): Promise<IAddress>;

  update(id: string, input: AddressUpdateInput): Promise<IAddress>;

  /**
   * REQ-5/REQ-7 — remove; se o endereço removido era o padrão, reatribui automaticamente outro
   * restante como padrão (o mais antigo). Retorna a lista já atualizada, escopada ao
   * `customerId` do endereço removido.
   */
  remove(id: string): Promise<IAddress[]>;

  /** REQ-6 — só um padrão por vez; desmarca qualquer outro do mesmo `customerId`. */
  setDefault(customerId: string, addressId: string): Promise<IAddress[]>;

  /** REQ-6a (`specs/0017-lgpd-privacidade`) — apaga todos os endereços do cliente (exclusão de
   * conta; diferente de `remove()`, que é um endereço por vez e reatribui padrão). */
  removeAllByCustomer(customerId: string): Promise<void>;
}
