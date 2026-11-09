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
    'A página já abre mostrando o PDF do relatório (total do período, separado por forma de pagamento, e a lista de pedidos abaixo); os filtros começam fechados — toque em FILTROS pra abrir, marcar status/tipos, escolher o período e, se quiser, buscar por número do pedido ou nome do cliente, e depois tocar em PESQUISAR.',
    'Pedidos cancelados entram na lista mas ficam fora do total — aparecem à parte em "Cancelados (fora do total)".',
    // specs/0208-redesign-movimento-caixa (ajuste 08/11/2026 #4) — PDF direto na page nos 4
    // relatórios, sem cabeçalho de restaurante/QR code (isso é só do cardápio).
    'O PDF usa o visualizador nativo do navegador — dá pra baixar ou imprimir direto por ele, sem precisar de nenhum botão extra na página.',
  ]),
  article(2, 'Movimento de Caixa', '/reports/cash-movements', 'relatorio-movimento-caixa', [
    'Abra Relatórios > Movimento de Caixa.',
    'A página já abre mostrando o PDF do relatório (saldo do período — entradas menos saídas — e a lista de lançamentos abaixo); os filtros começam fechados — toque em FILTROS pra abrir, marcar Entrada/Saída, escolher o período e, se quiser, filtrar por uma palavra da descrição, e depois tocar em PESQUISAR.',
    'Diferente do Caixa > Movimento de caixa (que só mostra o dia aberto agora), este relatório cruza vários dias/sessões de caixa de uma vez.',
    'O PDF usa o visualizador nativo do navegador — dá pra baixar ou imprimir direto por ele, sem precisar de nenhum botão extra na página.',
  ]),
  article(3, 'Contas a Pagar', '/reports/accounts-payable', 'relatorio-contas-pagar', [
    'Abra Relatórios > Contas a Pagar.',
    'A página já abre mostrando o PDF do relatório (total do período por status, mais "Efetivamente pago" — a soma do valor realmente pago, que pode diferir do valor original do título — e a lista de títulos abaixo); os filtros começam fechados — toque em FILTROS pra abrir, marcar status, escolher o período de vencimento e, se quiser, buscar por descrição, e depois tocar em PESQUISAR.',
    'Serve pra conferir o fluxo de contas a pagar de um intervalo maior do que a tela de Financeiro > Contas a pagar mostra de uma vez.',
    'O PDF usa o visualizador nativo do navegador — dá pra baixar ou imprimir direto por ele, sem precisar de nenhum botão extra na página.',
  ]),
  article(4, 'Contas a Receber', '/reports/accounts-receivable', 'relatorio-contas-receber', [
    'Abra Relatórios > Contas a Receber.',
    'A página já abre mostrando o PDF do relatório (total do período por status, mais "Efetivamente recebido" — a soma do valor realmente recebido de cada título — e a lista de títulos abaixo); os filtros começam fechados — toque em FILTROS pra abrir, marcar status, escolher o período de vencimento e, se quiser, buscar por descrição, e depois tocar em PESQUISAR.',
    'Mesmo princípio do relatório de Contas a Pagar, só que do lado do que o restaurante tem a receber.',
    'O PDF usa o visualizador nativo do navegador — dá pra baixar ou imprimir direto por ele, sem precisar de nenhum botão extra na página.',
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
