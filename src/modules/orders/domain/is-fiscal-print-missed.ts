import { IOrder } from './entities/order.entity';

/**
 * Pedido explícito do usuário (16/11/2026) — mesmo racional de `autoPrintMissed`
 * (`OrdersController.attachAutoPrintMissed`), pro cupom fiscal: nota emitida há mais de 3 minutos
 * sem `fiscalPrintStatus === 'printed'` provavelmente não foi impressa (bridge offline, fila
 * atrasada) — o operador usa pra saber que precisa abrir o DANFE e imprimir manualmente. 3 minutos
 * fixo (sem configuração própria por restaurante, diferente de `autoPrintMaxAgeMinutes`): a
 * impressão automática da nota já devia ter acontecido em segundos, não faz sentido um teto
 * configurável aqui.
 */
export function isFiscalPrintMissed(order: Pick<IOrder, 'fiscal' | 'fiscalPrintStatus'>): boolean {
  if (order.fiscal?.status !== 'emitido') return false;
  if (order.fiscalPrintStatus === 'printed') return false;
  if (!order.fiscal.emittedAt) return false;
  return Date.now() - new Date(order.fiscal.emittedAt).getTime() > 3 * 60_000;
}
