import { IAdditionalGroupTemplate, IAdditionalGroupTemplateOption } from '../entities/additional-group-template.entity';

export type NewAdditionalGroupTemplateOptionInput = Omit<IAdditionalGroupTemplateOption, 'id' | 'templateId'>;

export type NewAdditionalGroupTemplateInput = {
  name: string;
  type: IAdditionalGroupTemplate['type'];
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: NewAdditionalGroupTemplateOptionInput[];
};

/** specs/0026-selecao-clonar-excluir-busca-web REQ-7 — busca por nome (parcial) + ativo. */
export interface IAdditionalGroupTemplateListFilters {
  name?: string;
  isActive?: boolean;
}

export interface IAdditionalGroupTemplateRepository {
  listByRestaurant(restaurantId: string, filters?: IAdditionalGroupTemplateListFilters): Promise<IAdditionalGroupTemplate[]>;
  findById(id: string): Promise<IAdditionalGroupTemplate | null>;
  create(restaurantId: string, input: NewAdditionalGroupTemplateInput): Promise<IAdditionalGroupTemplate>;
  update(id: string, input: NewAdditionalGroupTemplateInput): Promise<IAdditionalGroupTemplate>;
  setActive(id: string, isActive: boolean): Promise<IAdditionalGroupTemplate>;
  /** specs/0026-selecao-clonar-excluir-busca-web REQ-4 — exclusão real (diferente de setActive). */
  remove(id: string): Promise<void>;
}
