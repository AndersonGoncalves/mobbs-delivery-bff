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
  /** specs/0049-catalogo-padrao-bebidas-reais REQ-17 — só os produtos com foto real publicada em
   * `app-imagens/` usam; os demais nascem sem `imageUrl` (caem no `defaultProductImageUrl` do
   * restaurante, igual qualquer produto sem foto própria). */
  imageUrl?: string;
  /** specs/0049-catalogo-padrao-bebidas-reais REQ-17 — `true` nos produtos pensados pra
   * aparecerem como opção vinculável em grupos de adicionais (REQ-18). Ausente = `false`
   * (default de `NewProductInput`), igual a todo o resto do seed. */
  availableAsAdditional?: boolean;
}

interface DefaultCatalogAdditionalGroupTemplateOption {
  name: string;
  priceDelta: number;
  /**
   * specs/0049-catalogo-padrao-bebidas-reais REQ-18 — nome (não id) de um `DefaultCatalogProduct`
   * do mesmo catálogo a vincular (`linkedProductId`) — resolvido em `seedDefaultCatalog.ts`
   * depois de criar todos os produtos (mesmo mecanismo de `linkedAdditionalGroupTemplateNames`,
   * na direção oposta: lá é produto -> template, aqui é opção de template -> produto). Ausente =
   * opção em texto puro, sem vínculo (comportamento default, igual antes desta spec).
   */
  linkedProductName?: string;
}

interface DefaultCatalogAdditionalGroupTemplate {
  name: string;
  type: 'adicionar' | 'remover';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: DefaultCatalogAdditionalGroupTemplateOption[];
}

interface DefaultCatalogCategory {
  categoryName: string;
  products: DefaultCatalogProduct[];
}

export interface DefaultCatalog {
  categories: DefaultCatalogCategory[];
  additionalGroupTemplates: DefaultCatalogAdditionalGroupTemplate[];
}

// specs/0049-catalogo-padrao-bebidas-reais REQ-17 — 12 produtos de bebida reais, validados
// manualmente pelo usuário em produção ("Meu Restaurante") e replicados aqui: substituem as
// opções em texto puro sem vínculo de REFRIGERANTES_TEMPLATE/BEBIDAS_TEMPLATE (ver
// `linkedProductName` nelas, REQ-18) por produtos de verdade, vinculáveis em qualquer grupo de
// adicionais do restaurante (`availableAsAdditional: true`), do mesmo jeito que o usuário fez.
// Só os 2 primeiros têm foto real publicada em `app-imagens/` — os nomes aqui precisam bater
// exatamente com `linkedProductName` nos templates abaixo.
function bebidasProducts(): DefaultCatalogProduct[] {
  return [
    {
      name: 'Coca-Cola 1 litro',
      price: 10,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/coca-cola-1l.jpeg',
    },
    {
      name: 'Guaraná Antarctica 1 litro',
      price: 8,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/guarana-antarctica-1l.jpeg',
    },
    { name: 'Fanta Laranja 1 litro',
      price: 8,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/fanta-laranja-1l.jpeg',
     },
    { name: 'Fanta Uva 1 litro',
      price: 8,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/fanta-uva-1l.webp',
    },
    { name: 'Sprite 1 litro',
      price: 8,
      availableAsAdditional: true,      
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/sprite-1l.jpeg',
    },
    { name: 'Coca-Cola lata 350ml',
      price: 6,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/coca-cola-350ml.jpeg',
    },
    { name: 'Guaraná Antarctica lata 350ml',
      price: 5.5,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/guarana-antarctica-350ml.jpeg',
    },
    { name: 'Fanta Laranja lata 350ml',
      price: 5.5,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/fanta-laranja-350ml.jpeg',
    },
    { name: 'Fanta Uva lata 350ml',
      price: 5.5,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/fanta-uva-350ml.jpeg',
    },
    { name: 'Sprite lata 350ml',
      price: 5.5,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/sprite-350ml.jpeg',
    },
    { name: 'Água indaiá com gás 500ml',
      price: 3.5,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/agua-indaia-com-gas-500ml.jpeg',
    },
    { name: 'Água indaiá sem gás 500ml',
      price: 3,
      availableAsAdditional: true,
      imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/agua-indaia-sem-gas-500ml.jpeg',
    },
  ];
}

// specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-11 — mesmas 3 categorias, sempre
// nesta ordem, depois da categoria própria do tipo de negócio, pra todos os 6 tipos. "Lanche" e
// "Sobremesas" continuam vazias (usuário não pediu produtos padrão pra elas); "Bebidas" ganhou os
// 12 produtos reais de `bebidasProducts()` em specs/0049-catalogo-padrao-bebidas-reais.
function extraCategories(): DefaultCatalogCategory[] {
  return [
    { categoryName: 'Lanches', products: [] },
    { categoryName: 'Bebidas', products: bebidasProducts() },
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

// Template reaproveitável de Refrigerantes 1 Litro — specs/0049-catalogo-padrao-bebidas-reais
// REQ-18/REQ-19: opções agora vinculadas (`linkedProductName`) aos produtos reais de
// `bebidasProducts()`, preços atualizados pros valores validados em produção (Guaraná/Fanta/
// Sprite: R$9 -> R$8; Coca-Cola manteve R$10).
const REFRIGERANTES_TEMPLATE: DefaultCatalogAdditionalGroupTemplate = {
  name: 'Refri?',
  type: 'adicionar',
  required: false,
  minSelections: 0,
  maxSelections: 1,
  options: [
    { name: 'Coca-Cola 1 litro', priceDelta: 10, linkedProductName: 'Coca-Cola 1 litro' },
    { name: 'Guaraná Antarctica 1 litro', priceDelta: 8, linkedProductName: 'Guaraná Antarctica 1 litro' },
    { name: 'Fanta Laranja 1 litro', priceDelta: 8, linkedProductName: 'Fanta Laranja 1 litro' },
    { name: 'Fanta Uva 1 litro', priceDelta: 8, linkedProductName: 'Fanta Uva 1 litro' },
    { name: 'Sprite 1 litro', priceDelta: 8, linkedProductName: 'Sprite 1 litro' },
  ],
};
// Template reaproveitável de Bebidas — specs/0049-catalogo-padrao-bebidas-reais REQ-18/REQ-19:
// opções vinculadas aos produtos reais, "Água com gás" atualizada pro preço validado (R$4 -> R$3,50).
const BEBIDAS_TEMPLATE: DefaultCatalogAdditionalGroupTemplate = {
  name: 'Bebidas?',
  type: 'adicionar',
  required: false,
  minSelections: 0,
  maxSelections: 1,
  options: [
    { name: 'Coca-Cola lata 350ml', priceDelta: 6, linkedProductName: 'Coca-Cola lata 350ml' },
    { name: 'Guaraná Antarctica lata 350ml', priceDelta: 5.5, linkedProductName: 'Guaraná Antarctica lata 350ml' },
    { name: 'Fanta Laranja lata 350ml', priceDelta: 5.5, linkedProductName: 'Fanta Laranja lata 350ml' },
    { name: 'Fanta Uva lata 350ml', priceDelta: 5.5, linkedProductName: 'Fanta Uva lata 350ml' },
    { name: 'Sprite lata 350ml', priceDelta: 5.5, linkedProductName: 'Sprite lata 350ml' },
    { name: 'Água indaiá com gás 500ml', priceDelta: 3.5, linkedProductName: 'Água indaiá com gás 500ml' },
    { name: 'Água indaiá sem gás 500ml', priceDelta: 3, linkedProductName: 'Água indaiá sem gás 500ml' },
  ],
};

export const DEFAULT_CATALOGS_BY_BUSINESS_TYPE: Record<BusinessType, DefaultCatalog> = {
  pizzaria: {
    categories: [
      {
        categoryName: 'Pizzas',
        products: [
          { name: 'Pizza Margherita',
            description: 'Molho de tomate, mussarela e manjericão.',
            price: 42,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-margherita.jpeg',
          },
          { name: 'Pizza Calabresa',
            description: 'Molho de tomate, mussarela, calabresa e cebola.',
            price: 44,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-calabresa.jpeg',
          },
          { name: 'Pizza Portuguesa',
            description: 'Presunto, ovos, cebola, azeitona e ervilha.',
            price: 46,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-portuguesa.jpeg',
          },
          { name: 'Pizza Quatro Queijos',
            description: 'Mussarela, provolone, parmesão e gorgonzola.',
            price: 48,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-quatro-queijos.jpeg',
          },
          { name: 'Pizza Frango com Catupiry',
            description: 'Frango desfiado e catupiry.',
            price: 45,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-frango-com-catupiry.jpeg' },
          { name: 'Pizza Carne do Sol',
            description: 'Carne do sol desfiada.',
            price: 55,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-carne-do-sol.jpeg',
          },
          { name: 'Pizza grande 2 sabores + Refri 1L grátis',
            description: 'Escolha 2 sabores de sua preferência. Acompanha refrigerante de 1 litro grátis.',
            price: 65,
            imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pizza-grande-2-sabores.jpeg',
            linkedAdditionalGroupTemplateNames: ['Bordas', 'Sabores da Pizza', 'Refri?'],
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
