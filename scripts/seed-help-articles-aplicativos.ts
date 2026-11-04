/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 11 (grupo "Aplicativos", 4 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-aplicativos
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/aplicativos';

const MODULE_KEY = 'aplicativos';
const MODULE_LABEL = 'Aplicativos';
const MODULE_ORDER = 11;

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
  article(1, 'Impressão Automática', '/auto-print', 'impressao-automatica', [
    'Abra Aplicativos > Impressão Automática.',
    'Ligue "Impressão automática", ajuste o intervalo de consulta (5-120s, padrão 10) e o limite de idade do pedido (1-60min, padrão 5 — evita imprimir de uma vez pedidos represados se a impressora ficou desligada), e toque em GERAR CHAVE (ou "Gerar nova chave", se já existir uma).',
    'Baixe o programa (Windows ou Linux) pro computador ligado à impressora e siga o passo a passo na tela — na primeira abertura, ele pede a Chave de API mostrada aqui e o nome/endereço da impressora.',
    'Com o bridge rodando, qualquer pedido de delivery/retirada confirmado imprime a comanda sozinho, sem precisar abrir esta tela.',
  ]),
  article(2, 'Comanda', '/settings/comanda-app', 'comanda', [
    'Abra Aplicativos > Comanda.',
    'Toque em BAIXAR .APK DA COMANDA (o app não vem da Play Store) no celular/tablet que o garçom vai usar.',
    'No Android do aparelho, ative "Instalar apps de fontes desconhecidas" antes de abrir o arquivo baixado (normalmente em Configurações > Apps > acesso especial, ou aparece como aviso na hora de abrir).',
    'Abra o app instalado e faça login com um operador deste restaurante (mesmo login da retaguarda web) — o app abre mesas, lança itens e fecha a conta direto do aparelho.',
  ]),
  article(3, 'KDS', '/settings/kds-app', 'kds', [
    'Abra Aplicativos > KDS.',
    'Toque em BAIXAR .APK DO KDS no tablet/monitor que vai ficar na cozinha.',
    'No Android do aparelho, ative "Instalar apps de fontes desconhecidas" antes de abrir o arquivo baixado, do mesmo jeito do app Comanda.',
    'Abra o app instalado e faça login com um operador deste restaurante — a tela mostra os pedidos em tempo real, por ordem de chegada, pra cozinha acompanhar o preparo.',
  ]),
  article(4, 'Autoatendimento', '/settings/totem', 'autoatendimento', [
    'Abra Aplicativos > Autoatendimento.',
    'Ligue "Totem", marque as formas de pagamento oferecidas nele (Dinheiro, pago no caixa, e/ou Pix, QR code na tela do totem — só essas duas na v1, sem maquininha integrada), e toque em GERAR CHAVE.',
    'Baixe o .apk do totem (botão mais abaixo) no tablet que vai ficar dentro do estabelecimento e siga o passo a passo — na primeira abertura, cole a chave de pareamento mostrada aqui.',
    'Pareado e ligado, o cliente monta o pedido sozinho no tablet — ideal pra balcão/autoatendimento sem depender de um operador no PDV o tempo todo.',
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
