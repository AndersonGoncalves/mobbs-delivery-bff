/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 9 (grupo "Acessórios", 6 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Uso: npm run seed:help-articles-acessorios
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/acessorios';

const MODULE_KEY = 'acessorios';
const MODULE_LABEL = 'Acessórios';
const MODULE_ORDER = 9;

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
  article(1, 'Cardápio', '/menu/pdf', 'cardapio-pdf', [
    'Abra Acessórios > Cardápio.',
    'O PDF do cardápio completo (com fotos, preços e QR code pra pedir pelo app) é gerado automaticamente ao abrir a página — não precisa clicar em nada.',
    'Use os botões do próprio visualizador de PDF (baixar, imprimir, girar) pra salvar ou imprimir o cardápio — eles já vêm prontos no visualizador do navegador.',
    'No celular (ou num navegador sem leitor de PDF embutido), a página mostra os botões ABRIR PDF e BAIXAR PDF em vez do visualizador embutido.',
  ]),
  article(2, 'QR Code do app', '/settings/qr-code', 'qr-code-app', [
    'Abra Acessórios > QR Code do app.',
    'Esse QR code leva direto pro cardápio online do seu restaurante (pedido de delivery/retirada) — use em panfletos, cartões, vitrine.',
    'Toque em IMPRIMIR QR CODE pra abrir uma folha pronta pra impressão, ou em SALVAR IMAGEM QR CODE pra baixar o PNG e usar em outras artes.',
    'O link por baixo do QR code também pode ser copiado e compartilhado direto (WhatsApp, redes sociais).',
  ]),
  article(3, 'QR Code de mesa', '/settings/table-qr-code', 'qr-code-mesa', [
    'Abra Acessórios > QR Code de mesa.',
    'Diferente do QR Code do app (delivery/retirada), este abre o cardápio de mesa — pra colar fisicamente em cada mesa, sem exigir login nem o app instalado.',
    'Toque em IMPRIMIR QR CODE ou SALVAR IMAGEM QR CODE do mesmo jeito do QR Code do app.',
    'Um único QR code de mesa serve pra todas as mesas do salão — o cliente escolhe a mesa dele ao abrir o cardápio.',
  ]),
  article(4, 'Ímã de geladeira', '/fridge-magnet', 'ima-geladeira', [
    'Abra Acessórios > Ímã de geladeira.',
    'Toque em PROCURAR IMAGEM pra trocar o fundo (opcional), ajuste a "Descrição do ímã de geladeira" e a cor do texto — a prévia à direita atualiza sozinha.',
    'O QR code, o link do cardápio e o WhatsApp do restaurante (se cadastrado) entram automaticamente na arte, sem precisar digitar de novo.',
    'Toque em SALVAR IMAGEM DO ÍMÃ pra baixar o PNG pronto pra gráfica, ou em IMPRIMIR pra imprimir direto.',
  ]),
  article(5, 'Automação Instagram', '/settings/instagram-automation', 'automacao-instagram', [
    'Abra Acessórios > Automação Instagram — exige uma conta Instagram comercial vinculada à Página do restaurante no Facebook.',
    'Toque em AUTORIZAR NO FACEBOOK: uma nova aba abre pra você autorizar a conexão com sua conta comercial.',
    'Depois de autorizado, use + AGENDAR POSTAGEM pra programar uma imagem, legenda e data/hora de publicação — a tabela de "Agendamentos" mostra Agendado/Publicado/Falhou pra cada uma.',
    'Um agendamento ainda "Agendado" pode ser cancelado pelo ícone de lixeira na linha dele; passou pra "Publicado" ou "Falhou", não dá mais pra desfazer.',
  ]),
  article(6, 'Sugestão de Impressoras', '/printer-suggestions', 'sugestao-impressoras', [
    'Abra Acessórios > Sugestão de Impressoras.',
    'Veja modelos de impressora térmica testados por outros restaurantes da plataforma, separados por "Computador" e "Celular".',
    'Toque em "Clique aqui para comprar" ao lado do modelo desejado pra abrir a página de compra (Mercado Livre) em outra aba.',
    'Essa lista é só uma sugestão — qualquer impressora térmica 80mm (computador) ou Bluetooth (celular) compatível também funciona com o bridge de Impressão Automática.',
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
