/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 7 (grupo "Relatórios", 4 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-relatorios
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/relatorios';

const MODULE_KEY = 'relatorios';
const MODULE_LABEL = 'Relatórios';
const MODULE_ORDER = 7;

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
  article(1, 'Pedidos', '/reports/orders', 'relatorio-pedidos', [
    'Abra Relatórios > Pedidos.',
    'Em FILTROS, marque os status e tipos de pedido que quer incluir, escolha o período (De/Até) e, se quiser, busque por número do pedido ou nome do cliente — depois toque em PESQUISAR.',
    'O topo mostra o total do período (sem cancelados) já separado por forma de pagamento; a lista abaixo traz pedido por pedido, com cliente, data/hora, status e forma de pagamento.',
    'Pedidos cancelados entram na lista mas ficam fora do total — aparecem à parte em "Cancelados (fora do total)".',
  ]),
  article(2, 'Movimento de Caixa', '/reports/cash-movements', 'relatorio-movimento-caixa', [
    'Abra Relatórios > Movimento de Caixa.',
    'Marque Entrada/Saída em "Tipo", escolha o período (De/Até) e, se quiser, filtre por uma palavra da descrição — depois toque em PESQUISAR.',
    'O topo mostra o saldo do período (entradas menos saídas); a lista abaixo traz cada lançamento (venda paga, sangria, troco de abertura etc.) com data/hora e valor.',
    'Diferente do Caixa > Movimento de caixa (que só mostra o dia aberto agora), este relatório cruza vários dias/sessões de caixa de uma vez.',
  ]),
  article(3, 'Contas a Pagar', '/reports/accounts-payable', 'relatorio-contas-pagar', [
    'Abra Relatórios > Contas a Pagar.',
    'Marque os status (Em aberto/Pago/Cancelado), escolha o período de vencimento (Vencimento de/até) e, se quiser, busque por descrição — depois toque em PESQUISAR.',
    'O topo resume o total do período por status, mais "Efetivamente pago" (soma do valor realmente pago, que pode diferir do valor original do título); a lista abaixo traz título por título com emissão, vencimento e status.',
    'Serve pra conferir o fluxo de contas a pagar de um intervalo maior do que a tela de Financeiro > Contas a pagar mostra de uma vez.',
  ]),
  article(4, 'Contas a Receber', '/reports/accounts-receivable', 'relatorio-contas-receber', [
    'Abra Relatórios > Contas a Receber.',
    'Marque os status (Em aberto/Recebido/Cancelado), escolha o período de vencimento (Vencimento de/até) e, se quiser, busque por descrição — depois toque em PESQUISAR.',
    'O topo resume o total do período por status, mais "Efetivamente recebido" (soma do valor realmente recebido de cada título); a lista abaixo traz título por título com emissão, vencimento, status e valor recebido.',
    'Mesmo princípio do relatório de Contas a Pagar, só que do lado do que o restaurante tem a receber.',
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
