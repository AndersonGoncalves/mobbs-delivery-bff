/** Mesma função de `mobbs-delivery-web/src/shared/format/strip-accents.ts` — compatibilidade
 * com impressora térmica (não reproduz bem UTF-8 acentuado). */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
