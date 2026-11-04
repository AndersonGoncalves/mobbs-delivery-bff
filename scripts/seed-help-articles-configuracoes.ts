/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 12 (grupo "Configurações", 2 itens, última fase
 * planejada — ver "Fases sugeridas" em spec.md). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-configuracoes
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/configuracoes';

const MODULE_KEY = 'configuracoes';
const MODULE_LABEL = 'Configurações';
const MODULE_ORDER = 12;

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
  article(1, 'Geral', '/settings/general', 'geral', [
    'Abra Configurações > Geral — cada campo salva sozinho ao ser alterado, sem um botão "Salvar" único.',
    '"Controle de estoque nas vendas" liga a baixa automática de estoque a cada venda (e recusa o pedido sem saldo); "Abertura do caixa" escolhe entre abrir manualmente ou automaticamente, seguindo o horário de funcionamento.',
    '"Valor mínimo do pedido", "Permitir cliente cancelar pedido" e o bloqueio de clientes ficam logo abaixo — e, se o restaurante tiver mesas cadastradas, também "Limite de consumo por mesa" e "Dias com música ao vivo" (controla quando o checkbox "Couvert" aparece no atendimento de mesas).',
    'Essas configurações migraram de várias telas espalhadas (Perfil do restaurante, Bloquear cliente, Mesas) pra um único lugar — se você procurava alguma delas no lugar antigo e não achou, é porque mudou pra cá.',
  ]),
  article(2, 'Alarme de pedidos', '/settings/order-alarm', 'alarme-pedidos', [
    'Abra Configurações > Alarme de pedidos.',
    'Ligue "Tocar alarme quando chegar pedido", escolha o som e ajuste o volume — um pedido novo do app (delivery/retirada) aguardando confirmação toca esse alarme em qualquer página da retaguarda, enquanto ela estiver aberta.',
    'Ligue "Repetir enquanto houver pedido aguardando confirmação" pra o alarme não parar sozinho até alguém confirmar o pedido — útil pra não deixar um pedido esquecido.',
    'Essa preferência vale só para este navegador/computador (não é salva no servidor) — em outro computador, configure de novo; e o navegador só libera o som depois de alguém tocar em qualquer lugar da página (proteção padrão contra autoplay).',
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
