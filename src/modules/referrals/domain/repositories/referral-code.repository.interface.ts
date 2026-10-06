/** specs/0110 REQ-1 — código de indicação de cada cliente, guardado à parte do cadastro do cliente. */
export interface IReferralCodeRepository {
  findByCustomerId(customerId: string): Promise<string | null>;
  findCustomerIdByCode(code: string): Promise<string | null>;
  save(customerId: string, code: string): Promise<void>;
}
