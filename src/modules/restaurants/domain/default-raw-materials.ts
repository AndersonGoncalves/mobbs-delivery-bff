import { appImageUrl } from './default-image-url';

/**
 * Matérias-primas padrão criadas no autocadastro, pra todo ramo de atividade (pedido do usuário: as principais
 * matérias-primas, como queijo e ovos, assim como já existem produtos padrão). Editáveis depois na retaguarda.
 * `unit` é texto livre (ver `specs/0015-estoque-compras`).
 */
export const DEFAULT_RAW_MATERIALS: { name: string; unit: string; imageUrl?: string }[] = [
  {
    name: 'Queijo mussarela',
    unit: 'kg',
    imageUrl: appImageUrl('queijo-mussarela.jpeg'),
  },
  { name: 'Queijo prato', unit: 'kg', imageUrl: appImageUrl('queijo-prato.jpeg') },
  {
    name: 'Presunto',
    unit: 'kg',
    imageUrl: appImageUrl('presunto.jpeg'),
  },
  { name: 'Ovo', unit: 'un', imageUrl: appImageUrl('ovo.jpeg') },
  { name: 'Pão', unit: 'un', imageUrl: appImageUrl('pao.jpeg') },
  {
    name: 'Carne bovina moída',
    unit: 'kg',
    imageUrl: appImageUrl('carne-bovina-moida.jpeg'),
  },
  {
    name: 'Frango desfiado',
    unit: 'kg',
    imageUrl: appImageUrl('frango-desfiado.jpeg'),
  },
  { name: 'Bacon', unit: 'kg', imageUrl: appImageUrl('bacon.jpeg') },
  { name: 'Tomate', unit: 'kg', imageUrl: appImageUrl('tomate.jpeg') },
  { name: 'Alface', unit: 'kg', imageUrl: appImageUrl('alface.jpeg') },
  { name: 'Cebola', unit: 'kg', imageUrl: appImageUrl('cebola.jpeg') },
  { name: 'Batata', unit: 'kg', imageUrl: appImageUrl('batata.jpeg') },
  { name: 'Leite', unit: 'L', imageUrl: appImageUrl('leite.jpeg') },
  { name: 'Maionese', unit: 'kg', imageUrl: appImageUrl('maionese.jpeg') },
  // Pedido explícito do usuário — lista adicional de matérias-primas comuns (sabores de
  // pizza/lanche, coberturas). Itens que já estavam na lista acima (bacon, carne moída ≈ carne
  // bovina moída, cebola, frango ≈ frango desfiado, mussarela ≈ queijo mussarela, ovo, presunto,
  // tomate) foram desconsiderados — só o que ainda não existia entra aqui.
  { name: 'Azeitona', unit: 'kg', imageUrl: appImageUrl('azeitona.jpeg') },
  { name: 'Banana', unit: 'kg', imageUrl: appImageUrl('banana.jpeg') },
  { name: 'Calabresa', unit: 'kg', imageUrl: appImageUrl('calabresa.jpeg') },
  { name: 'Calabresa picante', unit: 'kg', imageUrl: appImageUrl('calabresa-picante.png') },
  { name: 'Carne do sol', unit: 'kg', imageUrl: appImageUrl('carne-do-sol.png') },
  { name: 'Catupiry', unit: 'kg', imageUrl: appImageUrl('catupiry.png') },
  { name: 'Cheddar', unit: 'kg', imageUrl: appImageUrl('cheddar.png') },
  {
    name: 'Cream cheese',
    unit: 'kg',
    imageUrl: appImageUrl('cream-cheese.jpeg'),
  },
  { name: 'Milho', unit: 'kg', imageUrl: appImageUrl('milho.png') },
  { name: 'Molho da casa temperado', unit: 'kg', imageUrl: appImageUrl('molho-da-casa-temperado.jpeg') },
  { name: 'Orégano', unit: 'g', imageUrl: appImageUrl('oregano.jpeg') },
  { name: 'Passas', unit: 'g', imageUrl: appImageUrl('passas.jpeg') },
  { name: 'Purê', unit: 'kg', imageUrl: appImageUrl('pure.jpeg') },
  { name: 'Queijo coalho', unit: 'kg', imageUrl: appImageUrl('queijo-coalho.jpeg') },
  { name: 'Requeijão', unit: 'kg', imageUrl: appImageUrl('requeijao.jpeg') },
  { name: 'Salada', unit: 'kg', imageUrl: appImageUrl('salada.jpeg') },
];
