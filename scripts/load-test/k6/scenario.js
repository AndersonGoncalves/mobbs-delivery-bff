// Fase B — tráfego concorrente contra a API do BFF já de pé (apontada pro Firebase Auth
// Emulator) e o banco já populado pela Fase A. Rodar com `npm run loadtest:k6` (ver README.md)
// ou diretamente: `k6 run scripts/load-test/k6/scenario.js` (precisa do binário k6 instalado) ou
// `docker run --rm --network=host -v "$PWD":/work -w /work grafana/k6 run scripts/load-test/k6/scenario.js`.
//
// Fluxo simulado por iteração (1 "cliente" virtual): resolve o restaurante (público) -> vê o
// cardápio (autenticado) -> cria um pedido (autenticado, escrita) -> lista os próprios pedidos
// (autenticado, leitura na coleção de ~2,7M docs) -> ocasionalmente rastreia um pedido antigo
// (público, pelo índice único de trackingToken).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const fixtures = JSON.parse(open('./fixtures.json'));
const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3099';

const orderCreateDuration = new Trend('order_create_duration_ms');

// SMOKE=1 roda uma validação rápida (poucos VUs, curta duração) em vez do perfil completo —
// usado pra confirmar que o cenário/auth/endpoints estão certos antes de uma rodada de verdade.
const SMOKE = __ENV.SMOKE === '1';

export const options = {
  stages: SMOKE
    ? [{ duration: '15s', target: 3 }]
    : [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const token = pick(fixtures.tokens);
  const restaurant = pick(fixtures.restaurants);
  const authHeaders = { headers: { Authorization: `Bearer ${token.idToken}`, 'Content-Type': 'application/json' } };

  const resolveRes = http.get(`${BASE_URL}/restaurants/resolve/${restaurant.slug}`);
  check(resolveRes, { 'resolve restaurante: 200': (r) => r.status === 200 });

  const menuRes = http.get(`${BASE_URL}/restaurants/${restaurant.id}/menu-categories`, authHeaders);
  check(menuRes, { 'cardápio: 200': (r) => r.status === 200 });

  sleep(1);

  const product = pick(restaurant.products);
  const orderPayload = JSON.stringify({
    restaurantId: restaurant.id,
    items: [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        selections: [],
      },
    ],
    orderType: 'pickup',
    paymentMethod: 'cash',
  });
  const start = Date.now();
  const orderRes = http.post(`${BASE_URL}/orders`, orderPayload, authHeaders);
  orderCreateDuration.add(Date.now() - start);
  check(orderRes, { 'criar pedido: 200/201': (r) => r.status === 200 || r.status === 201 });

  sleep(1);

  const listRes = http.get(`${BASE_URL}/orders`, authHeaders);
  check(listRes, { 'listar meus pedidos: 200': (r) => r.status === 200 });

  if (restaurant.sampleTrackingToken && Math.random() < 0.3) {
    const trackRes = http.get(`${BASE_URL}/orders/track/${restaurant.sampleTrackingToken}`);
    check(trackRes, { 'rastrear pedido: 200': (r) => r.status === 200 });
  }

  sleep(1);
}
