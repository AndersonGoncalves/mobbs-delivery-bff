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

/**
 * specs/0025-adicionais-reutilizaveis-remocao REQ-2/REQ-3/REQ-8 — `templateId` presente marca um
 * grupo **vinculado** a um `IAdditionalGroupTemplate` (`modules/additional-group-templates`):
 * `name`/`type`/`required`/`minSelections`/`maxSelections`/`options` são resolvidos a partir do
 * template atual em toda leitura (`ProductMongooseRepository`), nunca sincronizados por escrita —
 * o que fica persistido nesses campos quando há `templateId` é só o último snapshot conhecido
 * (rede de segurança se o template for apagado, nunca lido em uso normal). Só grupos de 1º nível
 * podem ter `templateId` — `nestedAdditionalGroups` (produto composto) nunca vincula a template
 * nesta v1 (`plan.md` §Arquitetura da solução).
 */
export type AdditionalGroupType = 'adicionar' | 'remover';

export interface IProductAdditionalGroup {
  id: string;
  productId: string;
  templateId?: string;
  name: string;
  type: AdditionalGroupType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: IProductAdditionalOption[];
}

/**
 * Forma mínima aceita na **escrita** pra um grupo vinculado — o cliente manda só a referência
 * (`catalog.schemas.ts`, `productAdditionalGroupReferenceSchema`); `name`/`type`/`required`/etc.
 * não fazem sentido no payload porque vêm do template, não do cliente. `IProductAdditionalGroup`
 * continua sendo a forma de **leitura**, sempre completa (resolvida antes de responder).
 */
export interface IProductAdditionalGroupReference {
  id: string;
  productId: string;
  templateId: string;
}

export type IProductAdditionalGroupInput = IProductAdditionalGroup | IProductAdditionalGroupReference;

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
