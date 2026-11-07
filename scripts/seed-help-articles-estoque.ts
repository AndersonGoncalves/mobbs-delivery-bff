/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 6 (grupo "Estoque", 3 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Revisão (follow-up, pedido explícito do usuário) — conteúdo mais detalhado, com screenshot
 * extra do formulário de Fornecedor e de "Novo pedido de compra" preenchido, além da aba
 * "Matérias-primas" de Posição de estoque (a listagem original só cobria "Produtos").
 *
 * Uso: npm run seed:help-articles-estoque
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle, HelpArticleStep } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/estoque';

const MODULE_KEY = 'estoque';
const MODULE_LABEL = 'Estoque';
const MODULE_ORDER = 6;

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
  article(1, 'Fornecedores', '/suppliers', 'fornecedores', [
    ['Abra Estoque > Fornecedores — cadastro de quem vende matéria-prima/produtos pra você, usado depois em Estoque > Pedido de compra.', 'fornecedores'],
    ['Toque em NOVO: só o Nome é obrigatório; CNPJ/CPF, Telefone, E-mail e o endereço completo (CEP, Logradouro, Número, Complemento, Bairro, Cidade, UF) são todos opcionais — preencha o que facilitar seu controle, sem bloquear o cadastro rápido de um fornecedor novo no meio da correria.', 'fornecedores-form'],
    ['Use a chave ao lado de cada fornecedor pra marcá-lo como ativo/inativo sem precisar excluir o cadastro — um fornecedor inativo some das opções de "Pedido de compra" (mas pedidos antigos feitos com ele continuam no histórico normalmente).'],
    ['Editar/Copiar/Excluir seguem o padrão das outras listagens: clique na linha pra selecionar, ícones acima do grid; excluir é real e só "dono" vê o botão.'],
  ]),
  article(2, 'Pedido de compra', '/purchase-orders', 'pedido-compra', [
    ['Abra Estoque > Pedido de compra — registra o que você comprou de um fornecedor e dá entrada automática no estoque quando a mercadoria chega.', 'pedido-compra'],
    ['Toque em NOVO: escolha o Fornecedor, depois ADICIONAR ITEM pra cada linha comprada. Cada item pode ser uma Matéria-prima ou um Produto pronto pra revenda (ex. comprar refrigerante engarrafado já pronto pra vender) — só aparecem itens com "Controlar estoque" ativado no próprio cadastro (Cardápio > Matéria-prima / Produtos), senão o recebimento não teria em quê somar o saldo. Informe Quantidade e Custo unitário; o subtotal de cada linha e o Total do pedido somam sozinhos.', 'pedido-compra-form'],
    ['Quando a mercadoria chegar de fato, selecione o pedido na lista e toque no ícone de check (✓) pra marcar como "Recebido" — isso soma a quantidade comprada ao estoque de cada item automaticamente (mesmo efeito de um ajuste manual de entrada, mas rastreado como compra).'],
    ['Um pedido "Aberto" pode ser reaberto pelo ícone de olho pra editar fornecedor/itens antes de receber (útil se o fornecedor mandar menos do que o combinado); depois de "Recebido" ele vira só consulta — pra corrigir uma quantidade recebida errada, use o ajuste manual em Estoque > Posição de estoque, não dá pra editar o pedido já recebido.'],
  ]),
  article(3, 'Posição de estoque', '/stock', 'posicao-estoque', [
    ['Abra Estoque > Posição de estoque. Use as abas PRODUTOS/MATÉRIAS-PRIMAS pra alternar entre o estoque de produtos prontos (revenda, ex. bebida de garrafa) e de matérias-primas (ingredientes) — em ambas, só itens com "Controlar estoque" ativado no cadastro aparecem aqui; é uma tela só de consulta/ajuste, nada se cadastra por aqui.', 'posicao-estoque'],
    ['A coluna "Quantidade" mostra o saldo atual e "Estoque mínimo" o limite configurado no cadastro do item, lado a lado — uma linha com quantidade abaixo do mínimo fica destacada em vermelho na tabela inteira, pra chamar atenção rápido do que está acabando sem precisar comparar coluna por coluna.', 'posicao-estoque-materias-primas'],
    ['Selecione um item e toque no ícone de ajuste (⚙) pra lançar uma entrada/saída manual — use pra corrigir perda, quebra, contagem de inventário ou qualquer divergência que não veio de uma venda nem de um pedido de compra recebido.'],
    ['Toque no ícone de histórico (relógio) pra ver todas as movimentações daquele item — vendas, ajustes manuais e recebimentos de pedido de compra aparecem juntos, em ordem cronológica, cada um identificado pela origem.'],
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
