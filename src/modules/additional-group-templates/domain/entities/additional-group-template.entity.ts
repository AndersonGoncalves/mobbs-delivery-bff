/**
 * specs/0025-adicionais-reutilizaveis-remocao REQ-1/REQ-8 — grupo de adicionais reutilizável,
 * independente de qualquer produto: um `IProductAdditionalGroup` (`modules/catalog`) pode
 * referenciar um destes por `templateId` em vez de embutir a definição inteira. Resolvido na
 * leitura do produto (`ProductMongooseRepository`), nunca sincronizado por escrita em cascata —
 * ver `plan.md` §Arquitetura da solução.
 *
 * `type` distingue um grupo "adicionar" (opções custam extra) de um grupo "remover" (opções
 * excluem um ingrediente padrão do produto, sempre `priceDelta: 0` — REQ-8/REQ-10).
 */
export interface IAdditionalGroupTemplateOption {
  id: string;
  templateId: string;
  name: string;
  priceDelta: number;
  rawMaterialId?: string;
  /** specs/0041-item-adicional-vinculado-produto REQ-2/REQ-3 — mesmo campo/regra de
   * `IProductAdditionalOption.linkedProductId` (mutuamente exclusivo com `rawMaterialId`,
   * `name`/`imageUrl` resolvidos "ao vivo" a partir do produto vinculado). */
  linkedProductId?: string;
  /**
   * specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — corrige
   * `specs/0029` REQ-3: a foto é de cada opção, não do template/grupo inteiro.
   */
  imageUrl?: string;
}

export type AdditionalGroupType = 'adicionar' | 'remover';

export interface IAdditionalGroupTemplate {
  id: string;
  restaurantId: string;
  name: string;
  type: AdditionalGroupType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: IAdditionalGroupTemplateOption[];
  isActive: boolean;
}
