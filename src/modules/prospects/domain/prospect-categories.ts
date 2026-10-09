/**
 * specs/0123-prospeccao-restaurantes-google-maps REQ-4 — lista curada de ramos de atividade,
 * mapeada pros `includedTypes` que a Google Places API (New) realmente aceita (ela tem um
 * vocabulário fixo de tipos — não é texto livre). Resolve o [NEEDS CLARIFICATION] da spec: sem
 * tipo de "pastelaria" na API, por exemplo, por isso não entra aqui. Espelhado no lado web
 * (`shared/prospectCategories.ts`), mesmo padrão de `message-placeholders.ts`/`whatsappTemplates.ts`.
 */
export interface ProspectCategory {
  value: string;
  label: string;
  /** Tipo aceito por `includedTypes` no `places:searchNearby` da Google Places API (New). */
  placesType: string;
}

export const PROSPECT_CATEGORIES: readonly ProspectCategory[] = [
  { value: 'pizzaria', label: 'Pizzaria', placesType: 'pizza_restaurant' },
  { value: 'hamburgueria', label: 'Hamburgueria', placesType: 'hamburger_restaurant' },
  { value: 'restaurante', label: 'Restaurante', placesType: 'restaurant' },
  { value: 'lanchonete', label: 'Lanchonete', placesType: 'fast_food_restaurant' },
  { value: 'padaria', label: 'Padaria', placesType: 'bakery' },
  { value: 'bar', label: 'Bar', placesType: 'bar' },
  { value: 'cafeteria', label: 'Cafeteria', placesType: 'cafe' },
  { value: 'sorveteria', label: 'Sorveteria', placesType: 'ice_cream_shop' },
  { value: 'sanduicheria', label: 'Sanduicheria', placesType: 'sandwich_shop' },
] as const;

export const PROSPECT_CATEGORY_VALUES = PROSPECT_CATEGORIES.map((category) => category.value) as [string, ...string[]];

export function findProspectCategory(value: string): ProspectCategory | undefined {
  return PROSPECT_CATEGORIES.find((category) => category.value === value);
}
