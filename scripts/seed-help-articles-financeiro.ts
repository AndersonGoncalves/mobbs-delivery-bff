/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 5 (grupo "Financeiro", 3 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-financeiro
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/financeiro';

const MODULE_KEY = 'financeiro';
const MODULE_LABEL = 'Financeiro';
const MODULE_ORDER = 5;

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
  article(1, 'Contas a pagar', '/accounts-payable', 'contas-pagar', [
    'Abra Financeiro > Contas a pagar.',
    'Toque em NOVO: preencha a descrição, a data de emissão, o vencimento e o valor, e toque em SALVAR — o título entra como "Em aberto".',
    'Quando for pagar, selecione o título na lista e toque no ícone de cifrão ($) na barra de ações pra abrir "Marcar como pago"; confirme o valor pago e deixe "Movimentar o caixa" ligado se quiser que esse pagamento também lance uma saída no caixa do dia.',
    'Um título já pago não pode mais ser editado — só consultado; use o ícone de lápis pra alterar um título ainda "Em aberto".',
  ]),
  article(2, 'Contas a receber', '/accounts-receivable', 'contas-receber', [
    'Abra Financeiro > Contas a receber.',
    'Toque em NOVO: preencha a descrição, a data de emissão, o vencimento e o valor, e toque em SALVAR.',
    'Quando o cliente pagar, selecione o título e toque no ícone de cifrão ($) pra abrir "Marcar como recebido"; confirme o valor recebido e deixe "Movimentar o caixa" ligado se o dinheiro entrou no caixa físico do restaurante.',
    'Um título já recebido não pode mais ser editado — só consultado.',
  ]),
  article(3, 'Planos e assinatura', '/plans', 'planos-assinatura', [
    'Abra Financeiro > Planos e assinatura.',
    'Veja em qual faixa (Gratuito, Pro ou Premium) seu restaurante está hoje — calculada automaticamente pelo faturamento do mês em curso, sem nenhuma escolha manual.',
    'Compare os benefícios de cada faixa nos cards; o card com a borda verde e o selo "Plano atual" é o seu agora.',
    'O card "Anual" é uma contratação à parte, com preço fixo até o aniversário da adesão — só o Dono do restaurante pode contratar, no botão CONTRATAR ANUAL.',
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
