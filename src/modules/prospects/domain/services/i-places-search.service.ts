/** specs/0123-prospeccao-restaurantes-google-maps REQ-5. */
export interface PlacesSearchInput {
  latitude: number;
  longitude: number;
  /** Máximo aceito pela Google Places API (New) `searchNearby`: 50000. */
  radiusMeters: number;
  /** `ProspectCategory.placesType` (`domain/prospect-categories.ts`). */
  placesType: string;
}

export interface PlacesSearchResultItem {
  placeId: string;
  name: string;
  address?: string;
  phone?: string;
  rating?: number;
  latitude: number;
  longitude: number;
}

export interface IPlacesSearchService {
  /**
   * REQ-5 — busca estabelecimentos num raio a partir de um ponto. REQ-8: se a chave não estiver
   * configurada ou a API falhar, lança erro (o controller converte pra uma resposta clara, nunca
   * deixa a exceção crua chegar no cliente).
   */
  searchNearby(input: PlacesSearchInput): Promise<PlacesSearchResultItem[]>;
}
