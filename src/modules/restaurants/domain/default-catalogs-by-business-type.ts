import { BusinessType } from './business-type';

interface DefaultCatalogProduct {
  name: string;
  description?: string;
  price: number;
}

interface DefaultCatalogAdditionalGroupTemplate {
  name: string;
  type: 'adicionar' | 'remover';
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: { name: string; priceDelta: number }[];
}

export interface DefaultCatalog {
  categoryName: string;
  products: DefaultCatalogProduct[];
  /** specs/0039-onboarding-primeiro-acesso REQ-9 — templates ficam disponíveis pra retaguarda
   * (spec 0025, "grupos de adicionais reutilizáveis"), mas **não** pré-vinculados a nenhum
   * produto nesta v1 — vincular um produto a um template já existente é um fluxo de 2 cliques na
   * tela de edição do produto; evita o problema de referência circular de gerar o id do produto
   * antes dele existir só pra montar esse vínculo de antemão. */
  additionalGroupTemplates: DefaultCatalogAdditionalGroupTemplate[];
}

/** specs/0039-onboarding-primeiro-acesso REQ-9 — conteúdo de referência de mercado, sem imagem
 * (`imageUrl` ausente — REQ-9/spec.md "Fora de escopo"), preços em reais (ajustáveis pelo dono
 * depois). Uma categoria por tipo nesta v1, pra manter o catálogo inicial simples de revisar. */
export const DEFAULT_CATALOGS_BY_BUSINESS_TYPE: Record<BusinessType, DefaultCatalog> = {
  pizzaria: {
    categoryName: 'Pizzas',
    products: [
      { name: 'Pizza Margherita', description: 'Molho de tomate, mussarela e manjericão.', price: 42 },
      { name: 'Pizza Calabresa', description: 'Molho de tomate, mussarela, calabresa e cebola.', price: 44 },
      { name: 'Pizza Portuguesa', description: 'Presunto, ovos, cebola, azeitona e ervilha.', price: 46 },
      { name: 'Pizza Quatro Queijos', description: 'Mussarela, provolone, parmesão e gorgonzola.', price: 48 },
      { name: 'Pizza Frango com Catupiry', description: 'Frango desfiado e catupiry.', price: 45 },
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
        name: 'Borda recheada',
        type: 'adicionar',
        required: false,
        minSelections: 0,
        maxSelections: 1,
        options: [
          { name: 'Catupiry', priceDelta: 8 },
          { name: 'Cheddar', priceDelta: 8 },
          { name: 'Chocolate', priceDelta: 10 },
        ],
      },
    ],
  },
  hamburgueria: {
    categoryName: 'Hambúrgueres',
    products: [
      { name: 'X-Burguer', description: 'Pão, carne bovina, queijo e alface.', price: 19.9 },
      { name: 'X-Salada', description: 'Pão, carne bovina, queijo, alface, tomate e maionese.', price: 22.9 },
      { name: 'X-Bacon', description: 'Pão, carne bovina, queijo, bacon e alface.', price: 25.9 },
      { name: 'X-Tudo', description: 'Pão, carne bovina, queijo, bacon, ovo, presunto e salada.', price: 28.9 },
      { name: 'Veggie Burger', description: 'Hambúrguer de grão-de-bico, queijo e salada.', price: 24.9 },
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
    ],
  },
  pastelaria: {
    categoryName: 'Pastéis',
    products: [
      { name: 'Pastel de Carne', price: 12 },
      { name: 'Pastel de Queijo', price: 10 },
      { name: 'Pastel de Frango com Catupiry', price: 13 },
      { name: 'Pastel de Pizza', description: 'Molho de tomate, mussarela e orégano.', price: 12 },
      { name: 'Pastel Doce de Chocolate', price: 10 },
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
    ],
  },
  comida_japonesa: {
    categoryName: 'Combinados',
    products: [
      { name: 'Combinado 10 peças', description: 'Sushi e sashimi variados.', price: 35 },
      { name: 'Combinado 20 peças', description: 'Sushi e sashimi variados.', price: 60 },
      { name: 'Temaki Salmão', price: 25 },
      { name: 'Yakisoba', description: 'Macarrão oriental com legumes e proteína à escolha.', price: 30 },
      { name: 'Hot Roll', description: 'Enroladinho empanado, recheio de salmão e cream cheese.', price: 28 },
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
    ],
  },
  acai_sorveteria: {
    categoryName: 'Açaí',
    products: [
      { name: 'Açaí 300ml', price: 12 },
      { name: 'Açaí 500ml', price: 16 },
      { name: 'Açaí 700ml', price: 20 },
      { name: 'Sundae', price: 10 },
      { name: 'Milkshake', price: 14 },
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
    ],
  },
  lanches_gerais: {
    categoryName: 'Lanches',
    products: [
      { name: 'Misto Quente', price: 8 },
      { name: 'Bauru', description: 'Presunto, queijo, tomate e picles.', price: 12 },
      { name: 'Coxinha', price: 7 },
      { name: 'Salgado Assado', price: 6 },
      { name: 'Suco Natural', price: 8 },
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
    ],
  },
};
