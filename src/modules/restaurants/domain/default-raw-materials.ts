/**
 * Matérias-primas padrão criadas no autocadastro, pra todo ramo de atividade (pedido do usuário: as principais
 * matérias-primas, como queijo e ovos, assim como já existem produtos padrão). Editáveis depois na retaguarda.
 * `unit` é texto livre (ver `specs/0015-estoque-compras`).
 */
export const DEFAULT_RAW_MATERIALS: { name: string; unit: string; imageUrl?: string }[] = [
  {
    name: 'Queijo mussarela',
    unit: 'kg',
    imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/queijo-mussarela.jpeg',
  },
  { name: 'Queijo prato', unit: 'kg' },
  {
    name: 'Presunto',
    unit: 'kg',
    imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/presunto.jpeg',
  },
  { name: 'Ovo', unit: 'un', imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/ovo.jpeg' },
  { name: 'Pão', unit: 'un', imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/pao.jpeg' },
  {
    name: 'Carne bovina moída',
    unit: 'kg',
    imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/carne-bovina-moida.jpeg',
  },
  {
    name: 'Frango desfiado',
    unit: 'kg',
    imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/frango-desfiado.jpeg',
  },
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
  {
    name: 'Cream cheese',
    unit: 'kg',
    imageUrl: 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/cream-cheese.jpeg',
  },
  { name: 'Milho', unit: 'kg' },
  { name: 'Molho da casa temperado', unit: 'kg' },
  { name: 'Orégano', unit: 'g' },
  { name: 'Passas', unit: 'g' },
  { name: 'Purê', unit: 'kg' },
  { name: 'Queijo coalho', unit: 'kg' },
  { name: 'Requeijão', unit: 'kg' },
  { name: 'Salada', unit: 'kg' },
];
