/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 8 (grupo "Gráficos", 2 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-graficos
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/graficos';

const MODULE_KEY = 'graficos';
const MODULE_LABEL = 'Gráficos';
const MODULE_ORDER = 8;

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
  article(1, 'Pedidos', '/charts/orders', 'grafico-pedidos', [
    'Abra Gráficos > Pedidos.',
    'Use os atalhos HOJE/ÚLTIMA SEMANA/ÚLTIMO MÊS ou escolha um período (De/Até) e os status que quer incluir, depois toque em PESQUISAR — por padrão só entram pedidos que passaram pela cozinha (Em preparo, Saiu para entrega, Entregue).',
    'Em "Produtos mais vendidos", alterne entre QUANTIDADE/FATURAMENTO e TOP 10/TOP 20 pra ver o ranking sob ângulos diferentes; "Participação por categoria" mostra a fatia de faturamento de cada categoria do cardápio.',
    'No fim, "Pedidos e clientes por dia da semana" ajuda a enxergar os dias mais fortes do período filtrado — útil pra planejar compras e escala.',
  ]),
  article(2, 'Faturamento', '/charts/revenue', 'grafico-faturamento', [
    'Abra Gráficos > Faturamento.',
    'Escolha o período (De/Até), a granularidade DIA/SEMANA/MÊS e o tipo de gráfico BARRA/LINHA; ligue "Comparar com o período anterior" pra ver a linha tracejada do período equivalente anterior ao lado.',
    'O gráfico principal mostra faturamento bruto e lucro estimado (receita menos o custo cadastrado de cada produto vendido) lado a lado; "Evolução por meio de pagamento" separa esse mesmo faturamento por Pix/cartão/dinheiro ao longo do tempo.',
    'Mais abaixo, "Distribuição por tipo de pedido" (delivery/retirada/mesa) e "Distribuição por canal" (app do cliente/PDV/iFood/99Food/comanda/autoatendimento) ficam lado a lado; o mapa de calor "Dias e horários de pico" (todos os status, não só entregues) ajuda a dimensionar escala de cozinha, garçons e motoboys.',
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
