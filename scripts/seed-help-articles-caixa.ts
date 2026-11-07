/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 4 (grupo "Caixa", 4 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Revisão (follow-up, pedido explícito do usuário) — "Movimento de caixa" ganhou screenshot real
 * mostrando o dia com movimento (antes mostrava o aviso de "caixa de data anterior aberto", nada
 * representativo) e menciona a abertura automática e o tratamento de venda lançada depois do
 * fechamento (achados reais 06/11/2026, `cash-register.service.ts`). "Repasses Asaas" (e as
 * outras páginas que dependem do switch global de CNPJ) agora só aparece NESTA central de ajuda
 * quando aparece no menu lateral — filtro em `HelpManualPage.tsx`/`HelpArticleDetailPage.tsx`
 * (`pathRequiresCnpjIntegrations`), não precisa de nada neste script: o artigo continua existindo
 * no banco, só fica escondido na listagem enquanto o switch estiver desligado.
 *
 * Uso: npm run seed:help-articles-caixa
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle, HelpArticleStep } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/caixa';

const MODULE_KEY = 'caixa';
const MODULE_LABEL = 'Caixa';
const MODULE_ORDER = 4;

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
  article(1, 'Movimento de caixa', '/cash-register', 'movimento-caixa', [
    ['Abra Caixa > Movimento de caixa — cada data civil tem seu próprio caixa, e o fechamento é sempre uma conferência manual (ninguém fecha sozinho). Se o restaurante estiver configurado pra "Abertura automática" (Restaurante > Perfil), o caixa do dia já aparece aberto sozinho, com saldo inicial R$ 0,00 e o selo "Aberto automaticamente"; no modo manual, toque em ABRIR CAIXA informando o valor de abertura (dinheiro físico já no caixa).'],
    ['A aba "Movimento do dia" mostra o saldo atual, o recorte "Vendas de mesa e balcão" vs. "Vendas de delivery/retirada" e o total por forma de pagamento (Dinheiro, Pix, Cartão) — cada venda paga gera um lançamento automático aqui, sem precisar fazer nada. A lista "Movimentos" embaixo mostra cada lançamento, automático ou manual, com data/hora.', 'movimento-caixa'],
    ['Use LANÇAR MOVIMENTO pra registrar uma entrada ou saída manual (ex. troco, sangria, compra avulsa) — só funciona com o caixa aberto.'],
    ['Toque em FECHAR CAIXA no fim do dia: confira o "Saldo calculado" contra o dinheiro físico contado de verdade e informe o valor contado — a diferença entre os dois aparece na conferência final. Uma venda que acontecer DEPOIS do fechamento (ex. você entregou um pedido atrasado já tarde da noite) ainda é lançada normalmente, só que aparece separada no histórico desse fechamento, sem alterar o saldo/diferença que já foi conferido.'],
    ['Uma data nova só abre depois que a anterior for fechada — "Caixa para conferência" no topo mostra qualquer caixa pendente de data anterior, pra você selecionar e fechar antes de seguir.'],
  ]),
  article(2, 'Repasses de Motoboys', '/motoboy-payouts', 'repasses-motoboys', [
    ['Abra Caixa > Repasses de Motoboys.'],
    ['Escolha o período (De/Até) e, se quiser, filtre por um motoboy específico, depois toque em FILTRAR.', 'repasses-motoboys'],
    ['Veja o total a repassar e o número de pedidos entregues, com o total por motoboy logo abaixo.'],
    ['A tabela "Pedidos incluídos" lista pedido por pedido — o valor repassado é sempre a taxa de entrega daquele pedido, atribuída automaticamente a quem fez a entrega.'],
  ]),
  article(3, 'Repasses de Garçons', '/waiter-payouts', 'repasses-garcons', [
    ['Abra Caixa > Repasses de Garçons.'],
    ['Escolha o período (De/Até) e, se quiser, filtre por um garçom específico, depois toque em FILTRAR.', 'repasses-garcons'],
    ['Veja o total a repassar e o número de pedidos de mesa fechados no período, com o total por garçom logo abaixo.'],
    ['O valor repassado é a taxa de serviço de cada comanda fechada (configurada por mesa/pedido), nunca o valor total consumido pela mesa.'],
  ]),
  article(4, 'Repasses Asaas', '/asaas-balance', 'repasses-asaas', [
    ['Abra Caixa > Repasses Asaas — esse item só aparece no menu (e aqui na ajuda) quando a cobrança via Asaas estiver disponível na sua conta; se você não o vê no menu, não tem nada a configurar aqui ainda.'],
    ['Se aparecer "Conecte a cobrança pelo Asaas pra acompanhar seu saldo e repasses aqui", seu restaurante ainda não tem a cobrança online pelo Asaas conectada — toque no link pra ir à tela de conexão (Integrações > Asaas).', 'repasses-asaas'],
    ['Depois de conectado, esta tela mostra o saldo disponível na sua subconta Asaas e o histórico de repasses pra sua conta bancária.'],
    ['Esse saldo é só dos pagamentos recebidos via Asaas (Pix/cartão online com gateway) — não inclui dinheiro/Pix direto na chave nem cartão na maquininha.'],
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
