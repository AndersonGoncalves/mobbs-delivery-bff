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
}
