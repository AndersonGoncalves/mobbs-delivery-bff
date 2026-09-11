/**
 * Popula cardápio (categorias + produtos), matéria-prima e fornecedores de um restaurante já
 * existente — pra ver algo de verdade no app enquanto a retaguarda web ainda não está rodando
 * (que é quem normalmente cadastraria isso, `specs/0007`/`specs/0015`).
 *
 * Idempotente por substituição: cada execução APAGA o cardápio/matéria-prima/fornecedores
 * anteriores deste restaurante e insere de novo do zero — evita duplicar a cada rerun, sem
 * precisar de chave natural única em cada coleção.
 *
 * Uso:
 *   npm run seed:catalog -- --slug=meu-restaurante
 *
 * (rode `npm run seed:restaurant` antes, se o restaurante ainda não existir).
 *
 * Imagens: placeholders determinísticos do Picsum (`picsum.photos/seed/<slug>/...`) — sem fotos
 * reais dos produtos disponíveis neste ambiente, mas o app renderiza uma imagem de verdade em
 * cada card (não fica em branco).
 */
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { MenuCategoryModel } from '../src/modules/catalog/infra/models/menu-category.mongoose.model';
import { ProductModel } from '../src/modules/catalog/infra/models/product.mongoose.model';
import { RawMaterialModel } from '../src/modules/raw-materials/infra/models/raw-material.mongoose.model';
import { SupplierModel } from '../src/modules/suppliers/infra/models/supplier.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const image = (seed: string) => `https://picsum.photos/seed/${seed}/600/400`;

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = args.slug ?? 'restaurante-teste';

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

  // Limpa o que já existia deste restaurante antes de inserir de novo (idempotência por
  // substituição, ver comentário do topo do arquivo).
  await Promise.all([
    MenuCategoryModel.deleteMany({ restaurantId }),
    ProductModel.deleteMany({ restaurantId }),
    RawMaterialModel.deleteMany({ restaurantId }),
    SupplierModel.deleteMany({ restaurantId }),
  ]);

  // --- Matéria-prima (specs/0015-estoque-compras) ---------------------------------------------
  const rawMaterials = [
    { name: 'Pão de hambúrguer', unit: 'un', currentStock: 120, minimumStockAlert: 30, priceDelta: 0 },
    { name: 'Carne bovina (hambúrguer 120g)', unit: 'un', currentStock: 80, minimumStockAlert: 20, priceDelta: 0 },
    { name: 'Queijo cheddar (fatia)', unit: 'un', currentStock: 200, minimumStockAlert: 50, priceDelta: 3 },
    { name: 'Bacon (fatia)', unit: 'un', currentStock: 150, minimumStockAlert: 40, priceDelta: 4.5 },
    { name: 'Alface', unit: 'kg', currentStock: 8, minimumStockAlert: 2, priceDelta: 0 },
    { name: 'Tomate', unit: 'kg', currentStock: 10, minimumStockAlert: 2, priceDelta: 0 },
    { name: 'Molho de tomate (pizza)', unit: 'l', currentStock: 15, minimumStockAlert: 3, priceDelta: 0 },
    { name: 'Mussarela (pizza, kg)', unit: 'kg', currentStock: 12, minimumStockAlert: 3, priceDelta: 0 },
    { name: 'Calabresa fatiada', unit: 'kg', currentStock: 9, minimumStockAlert: 2, priceDelta: 0 },
    { name: 'Refrigerante lata 350ml', unit: 'un', currentStock: 96, minimumStockAlert: 24, priceDelta: 0 },
  ].map((rawMaterial) => ({ _id: randomUUID(), restaurantId, isActive: true, ...rawMaterial }));
  await RawMaterialModel.insertMany(rawMaterials);
  const rawMaterialByName = (name: string) => rawMaterials.find((r) => r.name === name)!._id;

  // --- Fornecedores (specs/0015-estoque-compras) ------------------------------------------------
  await SupplierModel.insertMany([
    {
      _id: randomUUID(),
      restaurantId,
      name: 'Distribuidora Central de Alimentos',
      phone: '(11) 3333-4444',
      email: 'contato@distribuidoracentral.com.br',
      isActive: true,
    },
    {
      _id: randomUUID(),
      restaurantId,
      name: 'Frigorífico Boa Carne',
      phone: '(11) 3222-1111',
      email: 'vendas@boacarne.com.br',
      isActive: true,
    },
  ]);

  // --- Cardápio (specs/0007-cadastro-produtos) --------------------------------------------------
  const categories = [
    { name: 'Lanches', sortOrder: 0 },
    { name: 'Pizzas', sortOrder: 1 },
    { name: 'Bebidas', sortOrder: 2 },
    { name: 'Sobremesas', sortOrder: 3 },
  ].map((category) => ({ _id: randomUUID(), restaurantId, ...category }));
  await MenuCategoryModel.insertMany(categories);
  const categoryIdByName = (name: string) => categories.find((c) => c.name === name)!._id;

  const lanchesId = categoryIdByName('Lanches');
  const pizzasId = categoryIdByName('Pizzas');
  const bebidasId = categoryIdByName('Bebidas');
  const sobremesasId = categoryIdByName('Sobremesas');

  const products = [
    // Lanches — o primeiro (X-Tudo) já vem com additionalGroups, pra demonstrar produto composto
    // (docs/architecture/data-model.md, "Produtos compostos") ligado à matéria-prima acima.
    {
      restaurantId,
      menuCategoryId: lanchesId,
      name: 'X-Tudo',
      description: 'Pão, carne bovina, queijo, bacon, alface e tomate.',
      imageUrl: image('x-tudo'),
      price: 28.9,
      isAvailable: true,
      additionalGroups: [
        {
          id: randomUUID(),
          productId: '',
          name: 'Adicionais',
          required: false,
          minSelections: 0,
          maxSelections: 3,
          options: [
            {
              id: randomUUID(),
              groupId: '',
              name: 'Queijo extra',
              priceDelta: 3,
              rawMaterialId: rawMaterialByName('Queijo cheddar (fatia)'),
              nestedAdditionalGroups: [],
            },
            {
              id: randomUUID(),
              groupId: '',
              name: 'Bacon extra',
              priceDelta: 4.5,
              rawMaterialId: rawMaterialByName('Bacon (fatia)'),
              nestedAdditionalGroups: [],
            },
          ],
        },
      ],
    },
    {
      restaurantId,
      menuCategoryId: lanchesId,
      name: 'X-Burguer',
      description: 'Pão, carne bovina e queijo.',
      imageUrl: image('x-burguer'),
      price: 19.9,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: lanchesId,
      name: 'X-Salada',
      description: 'Pão, carne bovina, queijo, alface e tomate.',
      imageUrl: image('x-salada'),
      price: 22.9,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: lanchesId,
      name: 'X-Bacon',
      description: 'Pão, carne bovina, queijo e bacon.',
      imageUrl: image('x-bacon'),
      price: 25.9,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: lanchesId,
      name: 'Veggie Burger',
      description: 'Hambúrguer de grão-de-bico, alface e tomate.',
      imageUrl: image('veggie-burger'),
      price: 24.9,
      isAvailable: true,
      additionalGroups: [],
    },
    // Pizzas
    {
      restaurantId,
      menuCategoryId: pizzasId,
      name: 'Pizza Margherita',
      description: 'Molho de tomate, mussarela e manjericão.',
      imageUrl: image('pizza-margherita'),
      price: 42.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: pizzasId,
      name: 'Pizza Calabresa',
      description: 'Molho de tomate, mussarela, calabresa e cebola.',
      imageUrl: image('pizza-calabresa'),
      price: 44.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: pizzasId,
      name: 'Pizza Quatro Queijos',
      description: 'Mussarela, provolone, parmesão e gorgonzola.',
      imageUrl: image('pizza-quatro-queijos'),
      price: 48.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: pizzasId,
      name: 'Pizza Portuguesa',
      description: 'Presunto, ovos, cebola, azeitona e ervilha.',
      imageUrl: image('pizza-portuguesa'),
      price: 46.0,
      isAvailable: true,
      additionalGroups: [],
    },
    // Bebidas
    {
      restaurantId,
      menuCategoryId: bebidasId,
      name: 'Coca-Cola Lata 350ml',
      description: undefined,
      imageUrl: image('coca-cola-lata'),
      price: 6.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: bebidasId,
      name: 'Guaraná Lata 350ml',
      description: undefined,
      imageUrl: image('guarana-lata'),
      price: 6.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: bebidasId,
      name: 'Suco de Laranja 500ml',
      description: 'Natural, sem adição de açúcar.',
      imageUrl: image('suco-laranja'),
      price: 9.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: bebidasId,
      name: 'Água Mineral 500ml',
      description: undefined,
      imageUrl: image('agua-mineral'),
      price: 4.0,
      isAvailable: true,
      additionalGroups: [],
    },
    // Sobremesas
    {
      restaurantId,
      menuCategoryId: sobremesasId,
      name: 'Petit Gateau',
      description: 'Com sorvete de creme.',
      imageUrl: image('petit-gateau'),
      price: 18.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: sobremesasId,
      name: 'Brownie com Sorvete',
      description: undefined,
      imageUrl: image('brownie'),
      price: 16.0,
      isAvailable: true,
      additionalGroups: [],
    },
    {
      restaurantId,
      menuCategoryId: sobremesasId,
      name: 'Milkshake de Chocolate',
      description: '400ml.',
      imageUrl: image('milkshake-chocolate'),
      price: 15.0,
      isAvailable: true,
      additionalGroups: [],
    },
  ].map((product) => {
    const _id = randomUUID();
    // Referências de volta (`productId`/`groupId`) só existem no X-Tudo — preenche agora que
    // o `_id` do produto já foi gerado.
    const additionalGroups = product.additionalGroups.map((group) => ({
      ...group,
      productId: _id,
      options: group.options.map((option) => ({ ...option, groupId: group.id })),
    }));
    return { _id, ...product, additionalGroups };
  });
  await ProductModel.insertMany(products);

  console.log(`\nCardápio criado pra "${restaurant.name}" (${slug}):`);
  console.log(`  ${categories.length} categorias, ${products.length} produtos`);
  console.log(`  ${rawMaterials.length} matérias-primas, 2 fornecedores`);
  console.log('\nTeste com:');
  console.log(`  curl http://localhost:3001/restaurants/${restaurantId}/menu-categories`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao popular o cardápio de teste:', error);
  process.exitCode = 1;
});
