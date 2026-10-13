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
  // Pedido explícito do usuário — lista adicional de matérias-primas comuns (sabores de
  // pizza/lanche, coberturas). Itens que já estavam na lista acima (bacon, carne moída ≈ carne
  // bovina moída, cebola, frango ≈ frango desfiado, mussarela ≈ queijo mussarela, ovo, presunto,
  // tomate) foram desconsiderados — só o que ainda não existia entra aqui.
  { name: 'Azeitona', unit: 'kg' },
  { name: 'Banana', unit: 'kg' },
  { name: 'Calabresa', unit: 'kg' },
  { name: 'Calabresa picante', unit: 'kg' },
  { name: 'Carne do sol', unit: 'kg' },
  { name: 'Catupiry', unit: 'kg' },
  { name: 'Cheddar', unit: 'kg' },
  { name: 'Cream cheese', unit: 'kg' },
  { name: 'Milho', unit: 'kg' },
  { name: 'Molho da casa temperado', unit: 'kg' },
  { name: 'Orégano', unit: 'g' },
  { name: 'Passas', unit: 'g' },
  { name: 'Purê', unit: 'kg' },
  { name: 'Queijo coalho', unit: 'kg' },
  { name: 'Requeijão', unit: 'kg' },
  { name: 'Salada', unit: 'kg' },
];
