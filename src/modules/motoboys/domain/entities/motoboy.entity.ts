/**
 * specs/0119-cadastro-motoboys — cadastro de entregadores do restaurante. Nesta v1, cadastral
 * puro: sem login próprio nem vínculo com pedido (ver `canMarkAsDelivered`) — fica salvo, sem
 * efeito funcional ainda, pra quando essa integração existir.
 */
export interface IMotoboy {
  id: string;
  restaurantId: string;
  name: string;
  whatsapp: string;
  /** specs/0119 REQ-3 — guardado pra quando o app do motoboy existir; sem efeito nenhum hoje. */
  canMarkAsDelivered: boolean;
  isActive: boolean;
}
