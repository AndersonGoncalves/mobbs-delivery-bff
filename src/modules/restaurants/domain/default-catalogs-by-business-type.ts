import { BusinessType } from './business-type';

interface DefaultCatalogProduct {
  name: string;
  description?: string;
  price: number;
  /**
   * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-12 — nomes (não ids, que só
   * existem depois de criados) de `DefaultCatalogAdditionalGroupTemplate` do mesmo catálogo a
   * vincular (`templateId`) neste produto — resolvido em `seedDefaultCatalog.ts` depois de criar
   * todos os templates. Ausente/vazio = produto sem grupos de adicionais (comportamento default,
   * igual a todo o resto do seed — script continua sem vincular automaticamente por padrão,
   * decisão confirmada com o usuário).
   */
  linkedAdditionalGroupTemplateNames?: string[];
}

interface DefaultCatalogAdditionalGroupTemplate {
  name: string;
  type: 'adicionar' | 'remover';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: { name: string; priceDelta: number }[];
}

interface DefaultCatalogCategory {
  categoryName: string;
  products: DefaultCatalogProduct[];
}

export interface DefaultCatalog {
  categories: DefaultCatalogCategory[];
  additionalGroupTemplates: DefaultCatalogAdditionalGroupTemplate[];
}

// specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-11 — mesmas 3 categorias, sempre
// nesta ordem, depois da categoria própria do tipo de negócio, pra todos os 6 tipos. Nascem vazias
// (sem produtos) — o usuário não pediu produtos padrão pra elas (só o produto específico de
// REQ-12, na categoria própria da pizzaria).
function extraCategories(): DefaultCatalogCategory[] {
  return [
    { categoryName: 'Lanche', products: [] },
    { categoryName: 'Bebidas', products: [] },
    { categoryName: 'Sobremesas', products: [] },
  ];
}

// Template reaproveitável de Sabores de Pizza (Obrigatório escolher exatamente 2)
const SABORES_PIZZA_TEMPLATE: DefaultCatalogAdditionalGroupTemplate = {
  name: 'Sabores da Pizza',
  type: 'adicionar',
  required: true,
  minSelections: 2,
  maxSelections: 2,
  options: [
    { name: 'Mussarela', priceDelta: 0 },
    { name: 'Mista', priceDelta: 0 },
    { name: 'Calabresa', priceDelta: 0 },
    { name: 'Frango', priceDelta: 0 },
    { name: 'Carne do Sol', priceDelta: 10 },
  ],
};

// Template reaproveitável de Refrigerantes 1 Litro
const REFRIGERANTES_TEMPLATE: DefaultCatalogAdditionalGroupTemplate = {
  name: 'Refri?',
  type: 'adicionar',
  required: false,
  minSelections: 0,
  maxSelections: 1,
  options: [
    { name: 'Coca-Cola 1 litro', priceDelta: 10 },
    { name: 'Guaraná Antarctica 1 litro', priceDelta: 9 },
    { name: 'Fanta Laranja 1 litro', priceDelta: 9 },
    { name: 'Fanta Uva 1 litro', priceDelta: 9 },
    { name: 'Sprite 1 litro', priceDelta: 9 },
  ],
};
// Template reaproveitável de Bebidas
const BEBIDAS_TEMPLATE: DefaultCatalogAdditionalGroupTemplate = {
  name: 'Bebidas?',
  type: 'adicionar',
  required: false,
  minSelections: 0,
  maxSelections: 1,
  options: [
    { name: 'Coca-Cola lata 350ml', priceDelta: 6 },
    { name: 'Guaraná Antarctica lata 350ml', priceDelta: 5.5 },
    { name: 'Fanta Laranja lata 350ml', priceDelta: 5.5 },
    { name: 'Fanta Uva lata 350ml', priceDelta: 5.5 },
    { name: 'Sprite lata 350ml', priceDelta: 5.5 },
    { name: 'Água com gás 500ml', priceDelta: 4 },
    { name: 'Água sem gás 500ml', priceDelta: 3.5 },
  ],
};

export const DEFAULT_CATALOGS_BY_BUSINESS_TYPE: Record<BusinessType, DefaultCatalog> = {
  pizzaria: {
    categories: [
      {
        categoryName: 'Pizzas',
        products: [
          { name: 'Pizza Margherita', description: 'Molho de tomate, mussarela e manjericão.', price: 42 },
          { name: 'Pizza Calabresa', description: 'Molho de tomate, mussarela, calabresa e cebola.', price: 44 },
          { name: 'Pizza Portuguesa', description: 'Presunto, ovos, cebola, azeitona e ervilha.', price: 46 },
          { name: 'Pizza Quatro Queijos', description: 'Mussarela, provolone, parmesão e gorgonzola.', price: 48 },
          { name: 'Pizza Frango com Catupiry', description: 'Frango desfiado e catupiry.', price: 45 },
          { name: 'Pizza Carne do Sol', description: 'Carne do sol desfiada.', price: 55 },
          {
            // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-12 — nome exato pedido
            // pelo usuário (substitui o antigo "Pizza 2 sabores + Refri 1l", mesmo conceito, agora
            // com os grupos de fato vinculados em vez de `additionalGroups: []`).
            name: 'Pizza grande 2 sabores + Refri 1L grátis',
            description: 'Escolha 2 sabores de sua preferência. Acompanha refrigerante de 1 litro grátis.',
            price: 65,
            linkedAdditionalGroupTemplateNames: ['Sabores da Pizza', 'Refri?'],
          },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Tamanho',
        type: 'adicionar',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { name: 'Pequena', priceDelta: 0 },
          { name: 'Média', priceDelta: 10 },
          { name: 'Grande', priceDelta: 20 },
        ],
      },
      {
        name: 'Bordas',
        type: 'adicionar',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { name: 'Borda Tradicional', priceDelta: 0 },
          { name: 'Borda Catupiry', priceDelta: 8 },
          { name: 'Borda Cheddar', priceDelta: 8 },
          { name: 'Borda Chocolate', priceDelta: 10 },
          { name: 'Borda Mussarela', priceDelta: 5 },
          { name: 'Borda Cream Cheese', priceDelta: 7 },
          { name: 'Borda Requeijão', priceDelta: 5 },
        ],
      },
      SABORES_PIZZA_TEMPLATE,
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
  hamburgueria: {
    categories: [
      {
        categoryName: 'Hambúrgueres',
        products: [
          { name: 'X-Burguer', description: 'Pão, carne bovina, queijo e alface.', price: 19.9 },
          { name: 'X-Salada', description: 'Pão, carne bovina, queijo, alface, tomate e maionese.', price: 22.9 },
          { name: 'X-Bacon', description: 'Pão, carne bovina, queijo, bacon e alface.', price: 25.9 },
          { name: 'X-Tudo', description: 'Pão, carne bovina, queijo, bacon, ovo, presunto e salada.', price: 28.9 },
          { name: 'Veggie Burger', description: 'Hambúrguer de grão-de-bico, queijo e salada.', price: 24.9 },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Ponto da carne',
        type: 'adicionar',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { name: 'Mal passado', priceDelta: 0 },
          { name: 'Ao ponto', priceDelta: 0 },
          { name: 'Bem passado', priceDelta: 0 },
        ],
      },
      {
        name: 'Adicionais',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { name: 'Bacon extra', priceDelta: 5 },
          { name: 'Queijo extra', priceDelta: 4 },
          { name: 'Ovo', priceDelta: 3 },
          { name: 'Cebola caramelizada', priceDelta: 3 },
        ],
      },
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
  pastelaria: {
    categories: [
      {
        categoryName: 'Pastéis',
        products: [
          { name: 'Pastel de Carne', price: 12 },
          { name: 'Pastel de Queijo', price: 10 },
          { name: 'Pastel de Frango com Catupiry', price: 13 },
          { name: 'Pastel de Pizza', description: 'Molho de tomate, mussarela e orégano.', price: 12 },
          { name: 'Pastel Doce de Chocolate', price: 10 },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Adicionais',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 3,
        options: [
          { name: 'Queijo extra', priceDelta: 3 },
          { name: 'Molho especial', priceDelta: 2 },
        ],
      },
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
  comida_japonesa: {
    categories: [
      {
        categoryName: 'Combinados',
        products: [
          { name: 'Combinado 10 peças', description: 'Sushi e sashimi variados.', price: 35 },
          { name: 'Combinado 20 peças', description: 'Sushi e sashimi variados.', price: 60 },
          { name: 'Temaki Salmão', price: 25 },
          { name: 'Yakisoba', description: 'Macarrão oriental com legumes e proteína à escolha.', price: 30 },
          { name: 'Hot Roll', description: 'Enroladinho empanado, recheio de salmão e cream cheese.', price: 28 },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Molhos',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 2,
        options: [
          { name: 'Tarê', priceDelta: 3 },
          { name: 'Gergelim', priceDelta: 3 },
        ],
      },
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
  acai_sorveteria: {
    categories: [
      {
        categoryName: 'Açaí',
        products: [
          { name: 'Açaí 300ml', price: 12 },
          { name: 'Açaí 500ml', price: 16 },
          { name: 'Açaí 700ml', price: 20 },
          { name: 'Sundae', price: 10 },
          { name: 'Milkshake', price: 14 },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Acompanhamentos',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 5,
        options: [
          { name: 'Granola', priceDelta: 2 },
          { name: 'Leite em pó', priceDelta: 2 },
          { name: 'Morango', priceDelta: 3 },
          { name: 'Banana', priceDelta: 2 },
          { name: 'Paçoca', priceDelta: 2 },
        ],
      },
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
  lanches_gerais: {
    categories: [
      {
        categoryName: 'Lanches',
        products: [
          { name: 'Misto Quente', price: 8 },
          { name: 'Bauru', description: 'Presunto, queijo, tomate e picles.', price: 12 },
          { name: 'Coxinha', price: 7 },
          { name: 'Salgado Assado', price: 6 },
          { name: 'Suco Natural', price: 8 },
        ],
      },
      ...extraCategories(),
    ],
    additionalGroupTemplates: [
      {
        name: 'Adicionais',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 3,
        options: [
          { name: 'Queijo extra', priceDelta: 2 },
          { name: 'Presunto extra', priceDelta: 2 },
        ],
      },
      REFRIGERANTES_TEMPLATE,
      BEBIDAS_TEMPLATE,
    ],
  },
};
