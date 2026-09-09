/**
 * Allowlist por restaurante de quem pode logar na retaguarda web
 * (docs/architecture/data-model.md §RestaurantOperator, specs/0002-autenticacao REQ-8/REQ-9,
 * specs/0010-configuracao-restaurante REQ-12/REQ-13). Sem papéis/permissões granulares nesta v1 —
 * todo operador ativo tem acesso total.
 */
export interface IRestaurantOperator {
  id: string;
  restaurantId: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
}
