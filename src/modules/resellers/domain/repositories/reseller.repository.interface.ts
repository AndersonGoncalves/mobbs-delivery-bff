import { IReseller } from '../entities/reseller.entity';

export interface IResellerRepository {
  create(input: { name: string; email: string; phone: string; code: string }): Promise<IReseller>;
  findById(id: string): Promise<IReseller | null>;
  /** REQ-3/REQ-4 — resolve o acesso ao painel da revenda (`reseller.middleware.ts`). */
  findByEmail(email: string): Promise<IReseller | null>;
  /** REQ-2 — garante unicidade do código gerado (`generate-reseller-code.ts`). */
  findByCode(code: string): Promise<IReseller | null>;
  /** REQ-12 — painel administrativo, sem paginação (mesmo padrão de `listAll` já usado em
   * `IRestaurantRepository`/`IReferralRepository`). */
  listAll(): Promise<IReseller[]>;
  /** REQ-16. */
  setActive(id: string, isActive: boolean): Promise<IReseller | null>;
  /** Pedido explícito do usuário (follow-up) — dados bancários (chave Pix) autoatendidos pelo
   * próprio revendedor, sem precisar chamar o financeiro no WhatsApp. */
  updatePixKey(id: string, pixKey: string): Promise<IReseller | null>;
}
