/**
 * Matérias-primas padrão criadas no autocadastro, pra todo ramo de atividade (pedido do usuário: as principais
 * matérias-primas, como queijo e ovos, assim como já existem produtos padrão). Editáveis depois na retaguarda.
 * `unit` é texto livre (ver `specs/0015-estoque-compras`).
 */
export const DEFAULT_RAW_MATERIALS: { name: string; unit: string }[] = [
  { name: 'Queijo mussarela', unit: 'kg' },
  { name: 'Queijo prato', unit: 'kg' },
  { name: 'Presunto', unit: 'kg' },
  { name: 'Ovo', unit: 'un' },
  { name: 'Pão', unit: 'un' },
  { name: 'Carne bovina moída', unit: 'kg' },
  { name: 'Frango desfiado', unit: 'kg' },
  { name: 'Bacon', unit: 'kg' },
  { name: 'Tomate', unit: 'kg' },
  { name: 'Alface', unit: 'kg' },
  { name: 'Cebola', unit: 'kg' },
  { name: 'Batata', unit: 'kg' },
  { name: 'Leite', unit: 'L' },
  { name: 'Maionese', unit: 'kg' },
];
