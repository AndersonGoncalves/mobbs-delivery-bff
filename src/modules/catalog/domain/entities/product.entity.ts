/**
 * docs/architecture/data-model.md §Product/§ProductAdditionalGroup/§ProductAdditionalOption —
 * os 4 arquétipos de produto (sem variação, sabor único obrigatório, adicionais opcionais,
 * produto composto) usam esta mesma estrutura recursiva, nunca entidades separadas.
 */
export interface IProductAdditionalOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  rawMaterialId?: string;
  nestedAdditionalGroups?: IProductAdditionalGroup[];
}

export interface IProductAdditionalGroup {
  id: string;
  productId: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: IProductAdditionalOption[];
}

export interface IProduct {
  id: string;
  restaurantId: string;
  menuCategoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  additionalGroups: IProductAdditionalGroup[];
}
