import { GooglePlacesService } from './google-places.service';

function mockFetchOnce(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json,
    text: async () => response.text ?? '',
  }) as unknown as typeof fetch;
}

describe('GooglePlacesService (specs/0123-prospeccao-restaurantes-google-maps)', () => {
  it('REQ-8: sem API key configurada, lança erro claro sem tentar chamar a API', async () => {
    const service = new GooglePlacesService(undefined);
    global.fetch = jest.fn();

    await expect(
      service.searchNearby({ latitude: -3.73, longitude: -38.52, radiusMeters: 5000, placesType: 'pizza_restaurant' }),
    ).rejects.toThrow('GOOGLE_PLACES_API_KEY');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('REQ-5: monta o corpo da requisição certo (includedTypes, raio, centro) e mapeia a resposta', async () => {
    mockFetchOnce({
      ok: true,
      json: {
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Pizzaria do João' },
            formattedAddress: 'Rua A, 123',
            nationalPhoneNumber: '(85) 98640-4604',
            rating: 4.5,
            location: { latitude: -3.73, longitude: -38.52 },
          },
        ],
      },
    });
    const service = new GooglePlacesService('fake-key');

    const results = await service.searchNearby({ latitude: -3.73, longitude: -38.52, radiusMeters: 5000, placesType: 'pizza_restaurant' });

    expect(results).toEqual([
      {
        placeId: 'place-1',
        name: 'Pizzaria do João',
        address: 'Rua A, 123',
        phone: '(85) 98640-4604',
        rating: 4.5,
        latitude: -3.73,
        longitude: -38.52,
      },
    ]);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(options.headers['X-Goog-Api-Key']).toBe('fake-key');
    const body = JSON.parse(options.body);
    expect(body.includedTypes).toEqual(['pizza_restaurant']);
    expect(body.locationRestriction.circle).toEqual({ center: { latitude: -3.73, longitude: -38.52 }, radius: 5000 });
  });

  it('REQ-5: resposta sem "places" (nenhum resultado) vira lista vazia, não erro', async () => {
    mockFetchOnce({ ok: true, json: {} });
    const service = new GooglePlacesService('fake-key');

    const results = await service.searchNearby({ latitude: -3.73, longitude: -38.52, radiusMeters: 5000, placesType: 'pizza_restaurant' });

    expect(results).toEqual([]);
  });

  it('REQ-8: resposta de erro HTTP da Google lança com o status', async () => {
    mockFetchOnce({ ok: false, status: 403, text: 'PERMISSION_DENIED' });
    const service = new GooglePlacesService('fake-key');

    await expect(
      service.searchNearby({ latitude: -3.73, longitude: -38.52, radiusMeters: 5000, placesType: 'pizza_restaurant' }),
    ).rejects.toThrow('403');
  });
});
