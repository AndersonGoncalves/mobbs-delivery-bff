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
 * - `financeiro`: só o módulo financeiro, mais confirmar Pix recebido (REQ-4). Rótulo exibido na
 *   retaguarda passou a ser "Caixa" (specs/0137 REQ-1), mas o valor interno continua `financeiro`.
 *
 * specs/0137-papeis-garcom-motoboy REQ-2/REQ-3 — dois papéis novos, cada um com acesso restrito a
 * um único módulo:
 * - `garcom`: só o mapa de mesas/PDV (`table-service`).
 * - `motoboy`: só a lista dos próprios pedidos atribuídos a ele (`GET /restaurants/me/orders/my-deliveries`).
 *
 * specs/0187-kds-cozinha REQ-7/REQ-19 — mais um papel restrito a um único app satélite
 * (`mobbs-delivery-kds`): `cozinha` só lê pedidos confirmados/em preparo e avança o próprio
 * status (`GET/PATCH /restaurants/me/kitchen/...`, `PATCH /restaurants/me/orders/:id/status`
 * restrito à janela `confirmado`/`emPreparo`) — sem cardápio, financeiro, configurações ou
 * qualquer outra rota.
 */
export type OperatorRole = 'dono' | 'gerente' | 'financeiro' | 'garcom' | 'motoboy' | 'cozinha';

export const OPERATOR_ROLES: OperatorRole[] = ['dono', 'gerente', 'financeiro', 'garcom', 'motoboy', 'cozinha'];

export interface IRestaurantOperator {
  id: string;
  restaurantId: string;
  email: string;
  // Opcional apenas para operadores históricos anteriores à exigência no cadastro.
  name?: string;
  whatsapp?: string;
  photoUrl?: string;
  role: OperatorRole;
  hasFullAccess?: boolean;
  isActive: boolean;
  createdAt: Date;
}
