/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 4 (grupo "Caixa", 4 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-caixa
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/caixa';

const MODULE_KEY = 'caixa';
const MODULE_LABEL = 'Caixa';
const MODULE_ORDER = 4;

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
  article(1, 'Movimento de caixa', '/cash-register', 'movimento-caixa', [
    'Abra Caixa > Movimento de caixa.',
    'Toque em ABRIR CAIXA no começo do dia, informando o valor de abertura (dinheiro físico no caixa).',
    'Acompanhe o saldo atual e o total por forma de pagamento (Dinheiro, Pix, Cartão) na aba "Movimento do dia" — cada pedido pago gera um lançamento automático aqui.',
    'Use LANÇAR MOVIMENTO pra registrar uma entrada ou saída manual (ex. troco, compra avulsa), e FECHAR CAIXA no fim do dia — cada data só pode ter um caixa, e uma data nova só abre depois que a anterior for fechada.',
  ]),
  article(2, 'Repasses de Motoboys', '/motoboy-payouts', 'repasses-motoboys', [
    'Abra Caixa > Repasses de Motoboys.',
    'Escolha o período (De/Até) e, se quiser, filtre por um motoboy específico, depois toque em FILTRAR.',
    'Veja o total a repassar e o número de pedidos entregues, com o total por motoboy logo abaixo.',
    'A tabela "Pedidos incluídos" lista pedido por pedido — o valor repassado é sempre a taxa de entrega daquele pedido, atribuída automaticamente a quem fez a entrega.',
  ]),
  article(3, 'Repasses de Garçons', '/waiter-payouts', 'repasses-garcons', [
    'Abra Caixa > Repasses de Garçons.',
    'Escolha o período (De/Até) e, se quiser, filtre por um garçom específico, depois toque em FILTRAR.',
    'Veja o total a repassar e o número de pedidos de mesa fechados no período, com o total por garçom logo abaixo.',
    'O valor repassado é a taxa de serviço de cada comanda fechada (configurada por mesa/pedido), nunca o valor total consumido pela mesa.',
  ]),
  article(4, 'Repasses Asaas', '/asaas-balance', 'repasses-asaas', [
    'Abra Caixa > Repasses Asaas.',
    'Se aparecer "Conecte a cobrança pelo Asaas pra acompanhar seu saldo e repasses aqui", seu restaurante ainda não tem a cobrança online pelo Asaas conectada — toque no link pra ir à tela de conexão (Integrações > Asaas).',
    'Depois de conectado, esta tela mostra o saldo disponível na sua subconta Asaas e o histórico de repasses pra sua conta bancária.',
    'Esse saldo é só dos pagamentos recebidos via Asaas (Pix/cartão online com gateway) — não inclui dinheiro/Pix direto na chave nem cartão na maquininha.',
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
