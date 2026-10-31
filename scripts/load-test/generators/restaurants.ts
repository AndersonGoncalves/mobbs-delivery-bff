import { randomUUID } from 'crypto';
import { RestaurantModel } from '../../../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { MenuCategoryModel } from '../../../src/modules/catalog/infra/models/menu-category.mongoose.model';
import { ProductModel } from '../../../src/modules/catalog/infra/models/product.mongoose.model';
import { RawMaterialModel } from '../../../src/modules/raw-materials/infra/models/raw-material.mongoose.model';
import { Prng } from '../prng';
import { LOAD_TEST_CONFIG, BATCH_SIZE } from '../config';
import { RESTAURANT_SEGMENTS, RESTAURANT_SUFFIXES, MENU_CATEGORY_NAMES, PRODUCT_NAMES_BY_CATEGORY, RAW_MATERIAL_NAMES } from '../fixtures';

const ALL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export interface GeneratedRestaurant {
  id: string;
  tierIndex: number;
  ordersPerDayMin: number;
  ordersPerDayMax: number;
  products: { id: string; name: string; price: number }[];
}

// `Model.insertMany` (não `.collection.insertMany`) ainda casta/aplica defaults e timestamps do
// schema por documento, só não dispara middleware de 'save' — rápido o bastante nestas
// quantidades (centenas/dezenas de milhares) e mantém os defaults certos sem reescrevê-los à mão.
export async function generateRestaurants(rng: Prng, onProgress: (done: number, total: number) => void): Promise<GeneratedRestaurant[]> {
  const { tiers, total, menuCategoriesMin, menuCategoriesMax } = LOAD_TEST_CONFIG.restaurants;
  const weightedTiers = tiers.map((t, i) => ({ weight: t.weight, value: i }));

  const result: GeneratedRestaurant[] = [];
  let pendingCategories: unknown[] = [];
  let pendingProducts: unknown[] = [];
  let pendingRawMaterials: unknown[] = [];
  const restaurantDocs: unknown[] = [];

  const flushProducts = async () => {
    if (pendingProducts.length === 0) return;
    await ProductModel.insertMany(pendingProducts, { ordered: false });
    pendingProducts = [];
  };
  const flushCategories = async () => {
    if (pendingCategories.length === 0) return;
    await MenuCategoryModel.insertMany(pendingCategories, { ordered: false });
    pendingCategories = [];
  };
  const flushRawMaterials = async () => {
    if (pendingRawMaterials.length === 0) return;
    await RawMaterialModel.insertMany(pendingRawMaterials, { ordered: false });
    pendingRawMaterials = [];
  };

  for (let i = 0; i < total; i++) {
    const tierIndex = rng.weighted(weightedTiers);
    const tier = tiers[tierIndex];
    const restaurantId = randomUUID();
    const name = `${rng.pick(RESTAURANT_SEGMENTS)} ${rng.pick(RESTAURANT_SUFFIXES)} ${i}`;
    const slug = `loadtest-${i}-${rng.hex(6)}`;
    const stockControlEnabled = rng.bool(LOAD_TEST_CONFIG.rawMaterials.restaurantsFraction);

    restaurantDocs.push({
      _id: restaurantId,
      name,
      slug,
      stockControlEnabled,
      minimumOrderValue: rng.pick([0, 15, 20, 25, 30]),
      deliveryFeeCents: rng.int(0, 15) * 100,
      rating: Math.round(rng.next() * 20 + 30) / 10,
      ratingCount: rng.int(0, 500),
      // Aberto 24/7 — simplificação deliberada: isRestaurantOpenNow() exige um IBusinessHours
      // pro dia atual (ver restaurant.entity.ts), e sem isso NENHUM pedido sintético (Fase B,
      // k6) passaria da revalidação de "restaurante aberto" em POST /orders.
      businessHours: ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, isClosed: false, openTime: '00:00', closeTime: '23:59' })),
    });

    const categoryCount = rng.int(menuCategoriesMin, menuCategoriesMax);
    const categories: { id: string; name: string }[] = [];
    for (let c = 0; c < categoryCount; c++) {
      const categoryId = randomUUID();
      const categoryName = MENU_CATEGORY_NAMES[c % MENU_CATEGORY_NAMES.length];
      categories.push({ id: categoryId, name: categoryName });
      pendingCategories.push({ _id: categoryId, restaurantId, name: categoryName, sortOrder: c });
    }

    const productCount = rng.int(tier.productsMin, tier.productsMax);
    const restaurantProducts: { id: string; name: string; price: number }[] = [];
    for (let p = 0; p < productCount; p++) {
      const category = rng.pick(categories);
      const productId = randomUUID();
      const namesInCategory = PRODUCT_NAMES_BY_CATEGORY[category.name];
      const productName = `${rng.pick(namesInCategory)} ${p}`;
      const price = Math.round((rng.next() * 45 + 8) * 100) / 100;
      restaurantProducts.push({ id: productId, name: productName, price });
      pendingProducts.push({
        _id: productId,
        restaurantId,
        menuCategoryId: category.id,
        name: productName,
        price,
        isAvailable: rng.bool(0.95),
      });
    }
    result.push({
      id: restaurantId,
      tierIndex,
      ordersPerDayMin: tier.ordersPerDayMin,
      ordersPerDayMax: tier.ordersPerDayMax,
      products: restaurantProducts,
    });

    if (stockControlEnabled) {
      const rawMaterialCount = rng.int(LOAD_TEST_CONFIG.rawMaterials.min, LOAD_TEST_CONFIG.rawMaterials.max);
      for (let r = 0; r < rawMaterialCount; r++) {
        pendingRawMaterials.push({
          _id: randomUUID(),
          restaurantId,
          name: `${rng.pick(RAW_MATERIAL_NAMES)} ${r}`,
          priceDelta: Math.round(rng.next() * 10 * 100) / 100,
          unit: rng.pick(['kg', 'g', 'un', 'l', 'ml']),
          tracksStock: true,
          currentStock: rng.int(0, 200),
        });
      }
    }

    if (pendingProducts.length >= BATCH_SIZE) await flushProducts();
    if (pendingCategories.length >= BATCH_SIZE) await flushCategories();
    if (pendingRawMaterials.length >= BATCH_SIZE) await flushRawMaterials();
    onProgress(i + 1, total);
  }

  await RestaurantModel.insertMany(restaurantDocs, { ordered: false });
  await flushCategories();
  await flushProducts();
  await flushRawMaterials();

  return result;
}
