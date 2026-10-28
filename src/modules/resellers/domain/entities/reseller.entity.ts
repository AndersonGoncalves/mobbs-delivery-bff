/**
 * specs/0189-painel-revenda REQ-1 — revendedor externo, dono de prospects/clientes próprios.
 * Não é um `PlatformAdmin` (lista estática `PLATFORM_ADMIN_EMAILS`) nem um `RestaurantOperator`
 * (vínculo com UM restaurante) — ator próprio, cadastrado pelo administrador da plataforma.
 */
export interface IReseller {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** Código de indicação de 6 caracteres, único (`?revenda=<code>` em `/gratis`). */
  code: string;
  isActive: boolean;
  createdAt: Date;
  /** Pedido explícito do usuário (follow-up) — dados bancários pro recebimento da comissão,
   * cadastrados pelo próprio revendedor (sem precisar chamar o financeiro no WhatsApp). Só a
   * chave Pix nesta v1 — o jeito mais simples/direto de pagar que o próprio sistema já usa em
   * todo o resto (`Order.pixKey` do restaurante, mesmo padrão). */
  pixKey?: string;
}
