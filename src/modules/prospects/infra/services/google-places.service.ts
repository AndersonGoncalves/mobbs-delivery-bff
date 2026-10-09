import { IPlacesSearchService, PlacesSearchInput, PlacesSearchResultItem } from '../../domain/services/i-places-search.service';

const SEARCH_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/** Só os campos usados por `PlacesSearchResultItem` — `X-Goog-FieldMask` pede explicitamente
 * cada um (REQ-5 do modelo enviado pelo usuário), nunca `*` (cobrança por campo retornado). */
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location,places.rating';

interface GooglePlaceApiItem {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  location?: { latitude?: number; longitude?: number };
}

interface GooglePlacesApiResponse {
  places?: GooglePlaceApiItem[];
}

/**
 * specs/0123-prospeccao-restaurantes-google-maps REQ-5/REQ-8 — chama a Google Places API (New),
 * endpoint `searchNearby`, conforme o modelo técnico que o usuário já tinha levantado (via
 * Gemini). REQ-5 do modelo: `maxResultCount: 20` é o teto da própria API por chamada; esta v1 não
 * pagina (`nextPageToken`) — `searchNearby` não devolve token de próxima página (diferente de
 * Text Search), então paginar exigiria deslocar o centro de busca, fora de escopo nesta v1 (ver
 * `[NEEDS CLARIFICATION]` da spec).
 */
export class GooglePlacesService implements IPlacesSearchService {
  constructor(private readonly apiKey: string | undefined) {}

  async searchNearby(input: PlacesSearchInput): Promise<PlacesSearchResultItem[]> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY não configurada — prospecção indisponível até a chave ser definida.');
    }

    const response = await fetch(SEARCH_NEARBY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: [input.placesType],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Google Places API respondeu ${response.status}: ${body}`);
    }

    const data = (await response.json()) as GooglePlacesApiResponse;
    return (data.places ?? [])
      .filter((place) => place.location?.latitude !== undefined && place.location?.longitude !== undefined)
      .map((place) => ({
        placeId: place.id,
        name: place.displayName?.text ?? '',
        address: place.formattedAddress,
        phone: place.nationalPhoneNumber,
        rating: place.rating,
        latitude: place.location!.latitude!,
        longitude: place.location!.longitude!,
      }));
  }
}
