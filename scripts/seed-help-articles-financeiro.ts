/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 5 (grupo "Financeiro", 3 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Revisão (follow-up, pedido explícito do usuário) — "Contas a pagar"/"Contas a receber" ganham
 * screenshot do diálogo de liquidação ("Marcar como pago"/"Marcar como recebido"), não só da
 * listagem.
 *
 * Uso: npm run seed:help-articles-financeiro
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle, HelpArticleStep } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/financeiro';

const MODULE_KEY = 'financeiro';
const MODULE_LABEL = 'Financeiro';
const MODULE_ORDER = 5;

function article(itemOrder: number, itemLabel: string, linkTo: string, articleImageKey: string, steps: ([string] | [string, string])[]): NewHelpArticle & { _id: string } {
  const mapped: HelpArticleStep[] = steps.map(([text, imageKey]) => (imageKey ? { text, imageUrl: `${IMAGE_BASE}/${imageKey}.png` } : { text }));
  return {
    _id: `help-retaguarda-${MODULE_KEY}-${articleImageKey}`,
    audience: 'retaguarda',
    moduleKey: MODULE_KEY,
    moduleLabel: MODULE_LABEL,
    moduleOrder: MODULE_ORDER,
    itemLabel,
    itemOrder,
    linkTo,
    title: itemLabel,
    steps: mapped,
  };
}

const ARTICLES = [
  article(1, 'Contas a pagar', '/accounts-payable', 'contas-pagar', [
    ['Abra Financeiro > Contas a pagar.', 'contas-pagar'],
    ['Toque em NOVO: preencha a descrição, a data de emissão, o vencimento e o valor, e toque em SALVAR — o título entra como "Em aberto".'],
    ['Quando for pagar, clique na linha do título pra selecioná-lo e toque no ícone de cifrão ($) na barra de ações pra abrir "Marcar como pago". Confirme o "Valor pago" (já vem preenchido com o valor original, mas pode ajustar se pagou com desconto/juro) e deixe "Movimentar o caixa" ligado se quiser que esse pagamento também lance uma saída automática no caixa do dia — desligue só se já tiver lançado esse pagamento manualmente em outro lugar, pra não contar duas vezes.', 'contas-pagar-liquidar'],
    ['Um título já pago não pode mais ser editado — só consultado; use o ícone de lápis pra alterar um título ainda "Em aberto".'],
  ]),
  article(2, 'Contas a receber', '/accounts-receivable', 'contas-receber', [
    ['Abra Financeiro > Contas a receber.', 'contas-receber'],
    ['Toque em NOVO: preencha a descrição, a data de emissão, o vencimento e o valor, e toque em SALVAR.'],
    ['Quando o cliente pagar, clique na linha do título e toque no ícone de cifrão ($) pra abrir "Marcar como recebido". Confirme o "Valor recebido" e deixe "Movimentar o caixa" ligado se o dinheiro entrou fisicamente no caixa do restaurante — desligado, o título fica "Recebido" só pro controle financeiro, sem mexer no saldo do caixa.', 'contas-receber-liquidar'],
    ['Um título já recebido não pode mais ser editado — só consultado.'],
  ]),
  article(3, 'Planos e assinatura', '/plans', 'planos-assinatura', [
    ['Abra Financeiro > Planos e assinatura.'],
    ['Veja em qual faixa (Gratuito, Pro ou Premium) seu restaurante está hoje — calculada automaticamente pelo faturamento do mês em curso, sem nenhuma escolha manual.', 'planos-assinatura'],
    ['Compare os benefícios de cada faixa nos cards; o card com a borda verde e o selo "Plano atual" é o seu agora.'],
    ['O card "Anual" é uma contratação à parte, com preço fixo até o aniversário da adesão — só o Dono do restaurante pode contratar, no botão CONTRATAR ANUAL.'],
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
