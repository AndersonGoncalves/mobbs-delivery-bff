// Escala alvo do teste de carga — ver conversa com o usuário em 2026-10-31. Simula ~1 ano de
// movimentação real da plataforma antes de ir para produção.
export const LOAD_TEST_CONFIG = {
  restaurants: {
    total: 500,
    // 70% pequenos / 25% médios / 5% grandes — faixas de produtos por restaurante.
    tiers: [
      { weight: 0.7, productsMin: 20, productsMax: 40, ordersPerDayMin: 2, ordersPerDayMax: 15 },
      { weight: 0.25, productsMin: 60, productsMax: 100, ordersPerDayMin: 10, ordersPerDayMax: 40 },
      { weight: 0.05, productsMin: 150, productsMax: 300, ordersPerDayMin: 30, ordersPerDayMax: 100 },
    ],
    menuCategoriesMin: 3,
    menuCategoriesMax: 8,
  },
  rawMaterials: {
    // só nos restaurantes com controle de estoque ligado.
    restaurantsFraction: 0.6,
    min: 30,
    max: 80,
  },
  customers: {
    total: 300_000,
  },
  addressesPerCustomerAvg: 1.5,
  orders: {
    // 1 ano terminando hoje.
    days: 365,
  },
  // Simplificação deliberada (reportada ao usuário): additionalGroups sempre vazio nos produtos
  // sintéticos — maximiza velocidade/confiabilidade da geração sem afetar o tamanho/formato do
  // banco de forma relevante (é um array por produto, não uma coleção própria).
} as const;

export const BATCH_SIZE = 5_000;
