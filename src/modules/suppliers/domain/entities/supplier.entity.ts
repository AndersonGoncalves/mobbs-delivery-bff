/**
 * docs/architecture/data-model.md §Supplier — fornecedor de matéria-prima do restaurante
 * (specs/0015-estoque-compras REQ-1). Cadastro simples, sem validação de dígito de
 * documento/histórico de cotação (fora de escopo, spec.md).
 */
export interface ISupplier {
  id: string;
  restaurantId: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}
