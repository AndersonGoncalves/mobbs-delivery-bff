/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 6 (grupo "Estoque", 3 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-estoque
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/estoque';

const MODULE_KEY = 'estoque';
const MODULE_LABEL = 'Estoque';
const MODULE_ORDER = 6;

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
  article(1, 'Fornecedores', '/suppliers', 'fornecedores', [
    'Abra Estoque > Fornecedores.',
    'Toque em NOVO: preencha nome, CNPJ/CPF, telefone, e-mail e endereço (todos opcionais, menos o nome), e toque em SALVAR.',
    'Use a chave ao lado de cada fornecedor pra marcá-lo como ativo/inativo sem precisar excluir o cadastro — um fornecedor inativo some das opções de "Pedido de compra".',
    'Esses fornecedores alimentam o campo "Fornecedor" de Estoque > Pedido de compra.',
  ]),
  article(2, 'Pedido de compra', '/purchase-orders', 'pedido-compra', [
    'Abra Estoque > Pedido de compra.',
    'Toque em NOVO: escolha o fornecedor, depois ADICIONAR ITEM pra cada matéria-prima ou produto comprado (só aparecem itens com "Controla estoque" ativado no cadastro), informando quantidade e custo unitário — o total soma sozinho.',
    'Quando a mercadoria chegar, selecione o pedido na lista e toque no ícone de check (✓) pra marcar como recebido — isso soma a quantidade comprada ao estoque de cada item automaticamente.',
    'Um pedido "Aberto" pode ser reaberto pelo ícone de olho pra editar fornecedor/itens antes de receber; depois de "Recebido" ele só pode ser consultado.',
  ]),
  article(3, 'Posição de estoque', '/stock', 'posicao-estoque', [
    'Abra Estoque > Posição de estoque.',
    'Use as abas PRODUTOS/MATÉRIAS-PRIMAS pra alternar entre o estoque de produtos prontos (revenda) e de matérias-primas — só itens com "Controla estoque" ativado no cadastro aparecem aqui.',
    'A coluna "Quantidade" mostra o saldo atual e "Estoque mínimo" o limite configurado no cadastro do item, lado a lado pra comparar rapidamente o que está acabando.',
    'Selecione um item e toque no ícone de ajuste pra lançar uma entrada/saída manual (ex. perda, quebra, contagem), ou no ícone de histórico pra ver todas as movimentações daquele item.',
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
