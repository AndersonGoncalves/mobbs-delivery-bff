import { PixKeyType } from '../pix-key';

export interface ICustomerPixKeyRecord {
  customerId: string;
  type: PixKeyType;
  /** Chave criptografada (`encryptField`). Nunca em claro. */
  encryptedValue: string;
  termsVersionAccepted: string;
  acceptedAt: Date;
  updatedAt: Date;
}

export interface ICustomerPixKeyRepository {
  findByCustomerId(customerId: string): Promise<ICustomerPixKeyRecord | null>;
  save(record: ICustomerPixKeyRecord): Promise<void>;
  deleteByCustomerId(customerId: string): Promise<void>;
}
