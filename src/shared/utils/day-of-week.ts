/**
 * specs/0115-categoria-foto-dias-ativos/specs/0116-ajustes-cadastro-produto — mesmo conjunto de
 * valores já usado por `IBusinessHours.dayOfWeek` (`restaurants.entity.ts`), extraído aqui pra
 * ser reaproveitado por `MenuCategory.activeDays`/`Product.activeDays`, que não têm relação de
 * domínio com `Restaurant` pra justificar importar dali.
 */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAYS_OF_WEEK: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
