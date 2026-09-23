import { IBusinessHours, IRestaurant } from './entities/restaurant.entity';

const DAY_NAMES: IBusinessHours['dayOfWeek'][] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * specs/0055-checkout-revalida-restaurante-aberto (reabre specs/0046/0033-REQ-7) — mesma regra de
 * `Restaurant.isOpenAt()` no app (`mobbs_restaurant_resolution`): `isActive` tem prioridade sobre
 * `businessHours`. Existe aqui pro BFF poder revalidar na criação do pedido — nunca confia só no
 * client, que pode ter aberto a tela de checkout antes do restaurante fechar (specs/0046 REQ-3
 * exige a loja fechada aparecer pro cliente, mas isso sozinho não impede um pedido em trânsito).
 */
export function isRestaurantOpenNow(restaurant: Pick<IRestaurant, 'isActive' | 'businessHours'>, instant: Date = new Date()): boolean {
  if (!restaurant.isActive) return false;

  const today = DAY_NAMES[instant.getDay()];
  const todayHours = restaurant.businessHours.find((day) => day.dayOfWeek === today);
  if (!todayHours || todayHours.isClosed || !todayHours.openTime || !todayHours.closeTime) return false;

  const instantMinutes = instant.getHours() * 60 + instant.getMinutes();
  return instantMinutes >= minutesSinceMidnight(todayHours.openTime) && instantMinutes < minutesSinceMidnight(todayHours.closeTime);
}

function minutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}
