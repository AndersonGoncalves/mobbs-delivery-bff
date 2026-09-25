import { IBusinessHours, IRestaurant } from './entities/restaurant.entity';

const RESTAURANT_TIMEZONE = 'America/Sao_Paulo';

const restaurantTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: RESTAURANT_TIMEZONE,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * specs/0055-checkout-revalida-restaurante-aberto (reabre specs/0046/0033-REQ-7) — mesma regra de
 * `Restaurant.isOpenAt()` no app (`mobbs_restaurant_resolution`): `isActive` tem prioridade sobre
 * `businessHours`. Existe aqui pro BFF poder revalidar na criação do pedido — nunca confia só no
 * client, que pode ter aberto a tela de checkout antes do restaurante fechar (specs/0046 REQ-3
 * exige a loja fechada aparecer pro cliente, mas isso sozinho não impede um pedido em trânsito).
 *
 * Bug real de produção corrigido aqui: o container do BFF roda em UTC (`node:20-alpine` sem `TZ`
 * definido, ver `Dockerfile`), mas `businessHours` é sempre cadastrado em horário de Brasília. Os
 * métodos locais de `Date` (`getDay()`/`getHours()`) seguem o fuso do processo — em UTC, então —
 * então à noite (a partir de ~21h BRT) o dia da semana em UTC já virou o dia seguinte, e esta
 * função consultava o horário de amanhã (ou nenhum) pro pedido de hoje, rejeitando com 409
 * "Restaurante fechado" pedidos feitos com o restaurante genuinamente aberto. `Intl.DateTimeFormat`
 * com `timeZone` explícito garante o dia/hora de Brasília não importa o fuso do processo.
 */
export function isRestaurantOpenNow(restaurant: Pick<IRestaurant, 'isActive' | 'businessHours'>, instant: Date = new Date()): boolean {
  if (!restaurant.isActive) return false;

  const parts = restaurantTimeFormatter.formatToParts(instant);
  const today = parts.find((part) => part.type === 'weekday')!.value.toLowerCase() as IBusinessHours['dayOfWeek'];
  // Quirk do ICU: meia-noite (00h) vem como "24", não "00", com `hour12: false`.
  const hour = Number(parts.find((part) => part.type === 'hour')!.value) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')!.value);

  const todayHours = restaurant.businessHours.find((day) => day.dayOfWeek === today);
  if (!todayHours || todayHours.isClosed || !todayHours.openTime || !todayHours.closeTime) return false;

  const instantMinutes = hour * 60 + minute;
  return instantMinutes >= minutesSinceMidnight(todayHours.openTime) && instantMinutes < minutesSinceMidnight(todayHours.closeTime);
}

function minutesSinceMidnight(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}
