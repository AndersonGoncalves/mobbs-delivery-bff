import { IProductAdditionalGroup } from '../../domain/entities/product.entity';
import { AdditionalGroupTemplateLeanDocument, resolveGroup } from './product.mongoose.repository';

function buildGroup(overrides: Partial<IProductAdditionalGroup> = {}): IProductAdditionalGroup {
  return {
    id: 'g-1',
    productId: 'p-1',
    name: 'BORDAS (snapshot antigo)',
    type: 'adicionar',
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [{ id: 'o-old', groupId: 'g-1', name: 'Opção antiga', priceDelta: 99 }],
    ...overrides,
  };
}

function buildTemplate(overrides: Partial<AdditionalGroupTemplateLeanDocument> = {}): AdditionalGroupTemplateLeanDocument {
  return {
    _id: 'tpl-1',
    name: 'BORDAS',
    type: 'adicionar',
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [{ id: 'o-1', name: 'Catupiry', priceDelta: 8 }],
    ...overrides,
  };
}

describe('resolveGroup (specs/0025-adicionais-reutilizaveis-remocao REQ-3)', () => {
  it('AC-2/AC-3: grupo sem templateId volta inalterado (grupo inline comum)', () => {
    const group = buildGroup({ templateId: undefined });

    expect(resolveGroup(group, new Map())).toBe(group);
  });

  it('AC-2/AC-3: grupo com templateId resolve pros dados ATUAIS do template, não pro snapshot salvo', () => {
    const group = buildGroup({ templateId: 'tpl-1', name: 'nome antigo qualquer' });
    const template = buildTemplate();
    const templatesById = new Map([['tpl-1', template]]);

    const resolved = resolveGroup(group, templatesById);

    expect(resolved.name).toBe('BORDAS');
    expect(resolved.required).toBe(true);
    expect(resolved.minSelections).toBe(1);
    expect(resolved.maxSelections).toBe(1);
    expect(resolved.options).toEqual([{ id: 'o-1', groupId: 'g-1', name: 'Catupiry', priceDelta: 8, rawMaterialId: undefined }]);
  });

  it('AC-2/AC-3: mantém id/productId/templateId do grupo do produto, nunca os do template', () => {
    const group = buildGroup({ id: 'g-do-produto', productId: 'p-do-produto', templateId: 'tpl-1' });
    const templatesById = new Map([['tpl-1', buildTemplate()]]);

    const resolved = resolveGroup(group, templatesById);

    expect(resolved.id).toBe('g-do-produto');
    expect(resolved.productId).toBe('p-do-produto');
    expect(resolved.templateId).toBe('tpl-1');
  });

  it('template desativado ainda resolve normalmente (isActive não é checado aqui — REQ-4 só impede novos vínculos)', () => {
    const group = buildGroup({ templateId: 'tpl-1' });
    const templatesById = new Map([['tpl-1', buildTemplate({ name: 'BORDAS (template desativado)' })]]);

    expect(resolveGroup(group, templatesById).name).toBe('BORDAS (template desativado)');
  });

  it('template apagado/não encontrado mantém o último snapshot conhecido, sem quebrar', () => {
    const group = buildGroup({ templateId: 'tpl-apagado' });

    expect(resolveGroup(group, new Map())).toBe(group);
  });

  it('grupo type "remover" resolvido também vem do template (não do snapshot)', () => {
    const group = buildGroup({ templateId: 'tpl-1', type: 'adicionar' });
    const template = buildTemplate({
      type: 'remover',
      options: [{ id: 'o-1', name: 'Cebola', priceDelta: 0 }],
    });

    const resolved = resolveGroup(group, new Map([['tpl-1', template]]));

    expect(resolved.type).toBe('remover');
    expect(resolved.options[0].priceDelta).toBe(0);
  });
});
