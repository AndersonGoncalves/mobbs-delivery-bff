/**
 * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-9 — popula o que falta pra ver de verdade
 * no app cliente os recursos de `specs/0028-destaques-vendidos-banners`: 3 banners (destino
 * produto/categoria/link externo — o externo aponta pro Instagram cadastrado aqui), pedidos
 * `entregue` suficientes pra formar um ranking de "Mais vendidos", e uma imagem no grupo de
 * adicionais do X-Tudo.
 *
 * Roda depois de `seed:restaurant` e `seed:catalog` (precisa do restaurante e do cardápio já
 * existirem — falha com uma mensagem clara se não encontrar).
 *
 * Idempotente por substituição, mesmo padrão de `seed-catalog.ts`: os banners são sempre
 * regravados por completo (`$set`), e os pedidos de seed usam um `customerId` fixo
 * (`seed-cliente-mais-vendidos`) — cada execução apaga só os pedidos anteriores com esse
 * `customerId` antes de inserir de novo, sem tocar em pedidos reais de clientes de verdade.
 *
 * Uso:
 *   npm run seed:highlights -- --slug=meu-restaurante --instagram=https://instagram.com/minha-loja
 */
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { MenuCategoryModel } from '../src/modules/catalog/infra/models/menu-category.mongoose.model';
import { ProductModel } from '../src/modules/catalog/infra/models/product.mongoose.model';
import { OrderModel } from '../src/modules/orders/infra/models/order.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const SEED_CUSTOMER_ID = 'seed-cliente-mais-vendidos';

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = args.slug ?? 'restaurante-teste';
  const instagramUrl = args.instagram ?? 'https://instagram.com/primepizza';

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);

  const restaurant = await RestaurantModel.findOne({ slug });
  if (!restaurant) {
    console.error(`Nenhum restaurante com slug "${slug}" — rode "npm run seed:restaurant" antes.`);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }
  const restaurantId = restaurant._id as string;

  const products = await ProductModel.find({ restaurantId });
  const categories = await MenuCategoryModel.find({ restaurantId });
  if (products.length === 0 || categories.length === 0) {
    console.error(`Restaurante "${slug}" não tem cardápio — rode "npm run seed:catalog" antes.`);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }
  const productByName = (name: string) => {
    const product = products.find((p) => p.name === name);
    if (!product) throw new Error(`Produto "${name}" não encontrado no cardápio de "${slug}".`);
    return product;
  };
  const categoryByName = (name: string) => {
    const category = categories.find((c) => c.name === name);
    if (!category) throw new Error(`Categoria "${name}" não encontrada no cardápio de "${slug}".`);
    return category;
  };

  const xTudo = productByName('X-Tudo');
  const pizzas = categoryByName('Pizzas');

  // --- Banners (specs/0028-destaques-vendidos-banners REQ-5/REQ-6) -----------------------------
  const banners = [
    {
      id: randomUUID(),
      imageUrl: 'https://picsum.photos/seed/banner-pizza-promocao/1200/500',
      linkType: 'product',
      productId: xTudo._id,
    },
    {
      id: randomUUID(),
      imageUrl: 'https://picsum.photos/seed/banner-pizzas-categoria/1200/500',
      linkType: 'category',
      menuCategoryId: pizzas._id,
    },
    {
      id: randomUUID(),
      imageUrl: 'https://picsum.photos/seed/banner-instagram/1200/500',
      linkType: 'externalUrl',
      externalUrl: instagramUrl,
    },
  ];

  await RestaurantModel.updateOne(
    { _id: restaurantId },
    {
      $set: {
        instagramUrl,
        showBanners: true,
        showBestSellers: true,
        showHighlights: true,
        banners,
      },
    },
  );

  // --- Imagem num grupo de adicionais (specs/0029 REQ-3, campo já existia sem exemplo) ----------
  await ProductModel.updateOne(
    { _id: xTudo._id, 'additionalGroups.0': { $exists: true } },
    { $set: { 'additionalGroups.0.imageUrl': 'https://picsum.photos/seed/grupo-adicionais-xtudo/400/300' } },
  );

  // --- Pedidos "entregue" pra popular o ranking de mais vendidos (specs/0028 REQ-2) -------------
  await OrderModel.deleteMany({ restaurantId, customerId: SEED_CUSTOMER_ID });

  // Quantidade de pedidos por produto define o ranking — X-Tudo > Pizza Calabresa > Coca-Cola >
  // X-Burguer > Pizza Margherita, o resto sem pedido nenhum (fora do ranking).
  const rankedOrders: Array<{ productName: string; count: number }> = [
    { productName: 'X-Tudo', count: 8 },
    { productName: 'Pizza Calabresa', count: 6 },
    { productName: 'Coca-Cola Lata 350ml', count: 5 },
    { productName: 'X-Burguer', count: 3 },
    { productName: 'Pizza Margherita', count: 2 },
  ];

  let orderNumber = (await OrderModel.countDocuments({ restaurantId })) + 1;
  const orders = rankedOrders.flatMap(({ productName, count }) => {
    const product = productByName(productName);
    return Array.from({ length: count }, () => {
      const itemId = randomUUID();
      const subtotal = product.price;
      return {
        _id: randomUUID(),
        orderNumber: orderNumber++,
        trackingToken: randomUUID(),
        customerId: SEED_CUSTOMER_ID,
        restaurantId,
        items: [
          {
            id: itemId,
            productId: product._id,
            productName: product.name,
            quantity: 1,
            selections: [],
            unitPrice: product.price,
          },
        ],
        orderType: 'delivery',
        deliveryAddress: 'Rua de Teste, 123, Centro, São Paulo - SP, 01000-000',
        status: 'entregue',
        statusHistory: [{ status: 'entregue', changedAt: new Date() }],
        subtotal,
        deliveryFee: 0,
        discount: 0,
        total: subtotal,
        paymentMethod: 'pix',
      };
    });
  });
  await OrderModel.insertMany(orders);

  console.log(`\nDestaques/banners/mais vendidos populados pra "${restaurant.name}" (${slug}):`);
  console.log(`  instagramUrl: ${instagramUrl}`);
  console.log(`  ${banners.length} banners (produto/categoria/link externo)`);
  console.log(`  ${orders.length} pedidos "entregue" (ranking: ${rankedOrders.map((r) => r.productName).join(' > ')})`);
  console.log(`  imagem adicionada ao grupo "Adicionais" do X-Tudo`);
  console.log('\nTeste com:');
  console.log(`  curl http://localhost:3001/restaurants/resolve/${slug}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao popular destaques/banners/mais vendidos:', error);
  process.exitCode = 1;
});
