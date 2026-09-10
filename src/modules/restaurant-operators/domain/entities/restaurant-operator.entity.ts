/**
 * Allowlist por restaurante de quem pode logar na retaguarda web
 * (docs/architecture/data-model.md §RestaurantOperator, specs/0002-autenticacao REQ-8/REQ-9,
 * specs/0010-configuracao-restaurante REQ-12/REQ-13).
 *
 * specs/0021-papeis-operador REQ-1 — cada operador tem um papel (`role`), que decide quais
 * módulos da retaguarda ele acessa (`requireOperatorRole`, `shared/http/require-operator-role.middleware.ts`):
 * - `dono`: acesso total, sem restrição (REQ-2), inclusive gestão de outros operadores.
 * - `gerente`: cardápio, estoque/compras, clientes, pedidos — sem financeiro nem gestão de
 *   operadores (REQ-3).
 * - `financeiro`: só o módulo financeiro, mais confirmar Pix recebido (REQ-4).
 */
export type OperatorRole = 'dono' | 'gerente' | 'financeiro';

export const OPERATOR_ROLES: OperatorRole[] = ['dono', 'gerente', 'financeiro'];

export interface IRestaurantOperator {
  id: string;
  restaurantId: string;
  email: string;
  role: OperatorRole;
  isActive: boolean;
  createdAt: Date;
}
