/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 2 (grupo "Cardápio", 7 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts` (ver o cabeçalho daquele arquivo pro processo completo de
 * captura de tela). Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-cardapio
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/cardapio';

const MODULE_KEY = 'cardapio';
const MODULE_LABEL = 'Cardápio';
const MODULE_ORDER = 2;

function article(itemOrder: number, itemLabel: string, linkTo: string, imageKey: string, steps: string[]): NewHelpArticle & { _id: string } {
  return {
    _id: `help-retaguarda-${MODULE_KEY}-${imageKey}`,
    audience: 'retaguarda',
    moduleKey: MODULE_KEY,
    moduleLabel: MODULE_LABEL,
    moduleOrder: MODULE_ORDER,
    itemLabel,
    itemOrder,
    linkTo,
    title: itemLabel,
    steps: steps.map((text, index) => (index === 1 ? { text, imageUrl: `${IMAGE_BASE}/${imageKey}.png` } : { text })),
  };
}

const ARTICLES = [
  article(1, 'Cardápio', '/menu', 'cardapio', [
    'Abra Cardápio > Cardápio.',
    'Veja a lista de categorias do seu cardápio (ex. "Lanches", "Pizzas", "Bebidas", "Sobremesas"), cada uma mostrando quantos produtos tem dentro.',
    'Use o botão ao lado de cada categoria pra ativar/desativar (categoria desativada some do cardápio do cliente), e as setas ↑/↓ pra reordenar — a ordem aqui é a mesma que o cliente vê no app.',
    'Pra criar uma categoria nova, digite o nome em "Nova categoria" e toque em ADICIONAR.',
  ]),
  article(2, 'Produtos', '/products', 'produtos', [
    'Abra Cardápio > Produtos.',
    'Toque em NOVO pra cadastrar um produto: preencha nome, categoria, preço, foto e disponibilidade.',
    'Na coluna "Disponível", use o botão pra tirar um produto do cardápio temporariamente (ex. acabou o ingrediente) sem precisar excluir o cadastro.',
    'Use PESQUISAR pra filtrar por nome/categoria quando a lista crescer.',
  ]),
  article(3, 'Matéria-prima', '/raw-materials', 'materia-prima', [
    'Abra Cardápio > Matéria-prima.',
    'Toque em NOVO pra cadastrar um ingrediente (ex. "Pão de hambúrguer", "Queijo cheddar"), com unidade de medida (un, kg, etc.) e preço padrão de custo.',
    'Essas matérias-primas podem ser vinculadas a produtos e a opções de Grupos de Adicionais pra controlar o estoque automaticamente a cada venda.',
    'Use o botão "Ativo" pra desativar uma matéria-prima sem apagar o histórico de uso dela.',
  ]),
  article(4, 'Grupos de Adicionais', '/additional-groups', 'grupos-adicionais', [
    'Abra Cardápio > Grupos de Adicionais.',
    'Toque em NOVO pra criar um grupo reutilizável (ex. "Bordas", "Acréscimos") — escolha o tipo "Adicionar" (soma itens, ex. borda recheada) ou "Remover" (tira ingrediente, ex. "sem cebola"), se é obrigatório, e o mínimo/máximo de opções que o cliente pode escolher.',
    'Cadastre as opções dentro do grupo (nome + preço de cada uma).',
    'Vincule o grupo a quantos produtos quiser — alterar o grupo aqui atualiza todos os produtos vinculados automaticamente, sem precisar editar um por um.',
  ]),
  article(5, 'Destaques', '/highlights', 'destaques', [
    'Abra Cardápio > Destaques.',
    'Esta tela só mostra a lista — pra adicionar um produto aos destaques, vá no cadastro dele (Cardápio > Produtos) e marque a opção "Aparecer em Destaques".',
    'Os produtos marcados aparecem aqui, nesta mesma ordem — use as setas ↑/↓ pra reorganizar como aparecem na vitrine do cardápio do cliente.',
    'Destaques são a seção de "vitrine" no topo do cardápio do cliente — use pra promover o que você mais quer vender.',
  ]),
  article(6, 'Mais pedidos', '/products/best-sellers', 'mais-pedidos', [
    'Abra Cardápio > Mais pedidos.',
    'Igual aos Destaques: marque "Aparecer em mais pedidos" no cadastro do produto (Cardápio > Produtos) pra ele entrar nesta lista.',
    'A ordem aqui é a ordem de exibição no cardápio do cliente — use as setas ↑/↓ pra ajustar.',
    'É uma seleção manual sua, não automática — o sistema não calcula sozinho quais produtos venderam mais; você decide o que aparece aqui.',
  ]),
  article(7, 'Peça também', '/products/cart-suggestions', 'peca-tambem', [
    'Abra Cardápio > Peça também.',
    'Marque "Aparecer em peça também" no cadastro do produto (geralmente itens pequenos, como bebidas e sobremesas) pra ele virar uma sugestão.',
    'Os produtos marcados aparecem no carrinho do cliente, sugerindo um item a mais antes de fechar o pedido — use as setas pra definir a ordem.',
    'Boa prática: escolha itens de ticket baixo e fácil de adicionar (bebida, sobremesa) — aumenta o valor do pedido sem parecer forçado.',
  ]),
];

async function main(): Promise<void> {
  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);

  for (const { _id, ...input } of ARTICLES) {
    await HelpArticleModel.findByIdAndUpdate(_id, { $set: input }, { upsert: true, setDefaultsOnInsert: true });
    console.log(`  ok: ${input.itemLabel}`);
  }

  console.log(`\n${ARTICLES.length} artigos aplicados (audience=retaguarda, moduleKey=${MODULE_KEY}).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao aplicar os artigos de ajuda:', error);
  process.exitCode = 1;
});
