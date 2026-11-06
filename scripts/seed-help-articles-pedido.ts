/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 3 (grupo "Pedido", 11 itens — era 12; "Mapa de
 * pedidos" deixou de ser item de menu/página própria (`/orders-map`) e virou a aba "Mapa" de
 * "Pedidos do app", pedido explícito do usuário (follow-up); o conteúdo foi incorporado no
 * artigo "Pedidos do app" e o artigo próprio antigo é removido do banco por este script). Mesmo
 * molde de `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * ATENÇÃO: o `moduleKey` aqui é `vendas`, não `pedido` — bate com a `key` real do grupo em
 * `nav-items.tsx` (o rótulo exibido é "Pedido", mas a chave interna do grupo sempre foi `vendas`,
 * herdada de uma nomenclatura anterior). Conferido direto no arquivo antes de escrever este seed.
 *
 * Uso: npm run seed:help-articles-pedido
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/pedido';

const MODULE_KEY = 'vendas';
const MODULE_LABEL = 'Pedido';
const MODULE_ORDER = 3;

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
  article(1, 'PDV', '/operator-pdv', 'pdv', [
    'Abra Pedido > PDV.',
    'Escolha o tipo do pedido: DELIVERY, RETIRADA ou BALCÃO.',
    'Pra delivery/retirada, digite o telefone do cliente e toque em BUSCAR (carrega os dados se ele já pediu antes) ou CADASTRO RÁPIDO pra um cliente novo; preencha o endereço de entrega se for delivery.',
    'Em "Itens", busque e adicione os produtos do cardápio, escolha a forma de pagamento e toque em REVISAR E FINALIZAR.',
    'Use as abas "PEDIDO 1"/"PEDIDO 2" pra montar mais de um pedido ao mesmo tempo, sem perder o que já estava digitando no outro.',
  ]),
  article(2, 'Atendimento de mesas', '/table-service', 'atendimento-mesas', [
    'Abra Pedido > Atendimento de mesas.',
    'Toque numa mesa livre (verde) pra abrir uma comanda nova, ou numa mesa ocupada pra continuar lançando itens; mesas cadastradas aparecem aqui automaticamente (cadastre em Restaurante > Mesas).',
    'Use NOVO BALCÃO pra atender um cliente sem reservar mesa (venda de balcão/Drive-Thru).',
    'Depois de fechar a comanda, ela aparece na aba FECHADOS — é esse fechamento que gera o repasse de garçom (Caixa > Repasses de Garçons).',
  ]),
  article(3, 'Pedidos do app', '/orders', 'pedidos-app', [
    'Abra Pedido > Pedidos do app.',
    'A aba PEDIDOS mostra um quadro com uma coluna por status: Aguardando confirmação, Confirmado, Em preparo, Saiu para entrega. Cada card tem os itens, o motoboy (quando atribuído), endereço e total.',
    'Use os botões do card (ex. INICIAR PREPARO, IMPRIMIR, CANCELAR) pra avançar o pedido de status em status.',
    'A aba MAPA mostra todos os pedidos do dia espalhados num mapa, cada um com uma cor conforme o status (legenda no topo) — útil pra entender a distribuição geográfica das entregas ou planejar rotas. Clique num marcador pra ver os detalhes daquele pedido.',
    'A aba ENTREGUES guarda o histórico dos pedidos já finalizados.',
  ]),
  article(4, 'Minhas entregas', '/my-deliveries', 'minhas-entregas', [
    'Esta tela só aparece pra operadores com o papel "Motoboy" (ver Restaurante > Operadores) — dono/gerente acompanham tudo em Pedido > Pedidos do app.',
    'Abra Pedido > Minhas entregas (menu do próprio motoboy).',
    'Veja só os pedidos atribuídos a você, com endereço, WhatsApp do cliente e total.',
    'Toque em MARCAR COMO ENTREGUE assim que concluir a entrega — isso atualiza o status pro cliente e conta pro seu repasse (Caixa > Repasses de Motoboys).',
  ]),
  article(5, 'Clientes', '/customers', 'clientes', [
    'Abra Pedido > Clientes.',
    'Veja a lista de clientes que já pediram no seu restaurante, com total de pedidos, total gasto e data do último pedido.',
    'Toque em NOVO pra cadastrar um cliente manualmente (útil pra atendimento por telefone, sem passar pelo app).',
    'Use os ícones da barra de ações (editar, ver pedidos, endereço) pra abrir detalhes de um cliente selecionado.',
  ]),
  article(6, 'Bloquear cliente', '/block-customer', 'bloquear-cliente', [
    'Abra Pedido > Bloquear cliente.',
    'Se aparecer "O bloqueio de clientes está desabilitado", vá em Configurações > Geral e ligue a opção antes de continuar.',
    'Com o bloqueio habilitado, digite o celular com DDD do cliente e toque em BLOQUEAR — esse número não consegue mais fazer pedidos no seu restaurante.',
    'Pra desbloquear, toque no ícone de lixeira na linha do cliente bloqueado.',
  ]),
  article(7, 'Avaliações', '/ratings', 'avaliacoes', [
    'Abra Pedido > Avaliações.',
    'Veja as notas (1 a 5 estrelas) e comentários deixados pelos clientes depois do pedido.',
    'Toque em "Responder" pra escrever uma resposta pública, que aparece logo abaixo do comentário do cliente — útil pra agradecer um elogio ou esclarecer uma reclamação.',
    'Avaliações não podem ser excluídas nem editadas pelo restaurante — só respondidas.',
  ]),
  article(8, 'Cupons de desconto', '/coupons', 'cupons', [
    'Abra Pedido > Cupons de desconto.',
    'Toque em NOVO: defina o código (o que o cliente digita no checkout), o tipo de desconto (percentual ou valor fixo), o valor mínimo do pedido, o período de validade e os limites de uso (total e por cliente).',
    'Use o botão "Ativo" pra ligar/desligar um cupom sem precisar excluí-lo.',
    'A coluna "Uso" mostra quantas vezes o cupom já foi usado em relação ao limite configurado.',
  ]),
  article(9, 'Promoções', '/promotions', 'promocoes', [
    'Abra Pedido > Promoções.',
    'Toque em NOVA: dê um nome pra promoção, o percentual de desconto e selecione quais produtos entram (ex. "todas as pizzas"), com data de início e fim.',
    'Produtos em promoção ganham uma tag de desconto automaticamente no cardápio do cliente — o preço já aparece com o desconto aplicado.',
    'Use o botão "Ativa" pra pausar uma promoção antes da data de fim, se precisar.',
  ]),
  article(10, 'Cashback e Fidelidade', '/settings/cashback-fidelidade', 'cashback-fidelidade', [
    'Abra Pedido > Cashback e Fidelidade.',
    'Em "Cashback", defina o percentual que o cliente ganha de volta (em crédito) em cada pedido entregue — deixe em branco ou 0 pra desligar.',
    'Em "Programa de fidelidade", defina quantos pedidos o cliente precisa completar pra ganhar uma recompensa em R$, e o valor mínimo de pedido que conta pro cartão — deixe os campos em branco pra desligar.',
    'Toque em SALVAR. O crédito acumulado (cashback + fidelidade) fica disponível pro cliente usar em pedidos futuros no seu restaurante.',
  ]),
  article(11, 'Campanhas', '/campaigns', 'campanhas', [
    'Abra Pedido > Campanhas.',
    'Conecte o WhatsApp do restaurante primeiro (botão CONECTAR WHATSAPP) — sem conexão não dá pra disparar campanhas.',
    'Escreva a mensagem em "Mensagem" — o link do cardápio e o link de descadastro são adicionados automaticamente; use {linkCardapio} e {linkDescadastro} pra escolher onde eles entram no texto.',
    'Se quiser, exclua clientes específicos do disparo em "Excluir clientes deste disparo", e envie. Atenção ao aviso: envio em massa tem risco real de bloqueio do número — use com moderação, o disparo é sempre manual.',
  ]),
];

// (follow-up) — "Mapa de pedidos" deixou de ser item próprio (virou a aba "Mapa" de "Pedidos do
// app", incorporada no artigo acima); remove o artigo antigo do banco pra não deixar um link
// morto (`/orders-map`) na central de ajuda depois que este script roda de novo.
const REMOVED_ARTICLE_IDS = [`help-retaguarda-${MODULE_KEY}-mapa-pedidos`];

async function main(): Promise<void> {
  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);

  for (const { _id, ...input } of ARTICLES) {
    await HelpArticleModel.findByIdAndUpdate(_id, { $set: input }, { upsert: true, setDefaultsOnInsert: true });
    console.log(`  ok: ${input.itemLabel}`);
  }

  for (const _id of REMOVED_ARTICLE_IDS) {
    const { deletedCount } = await HelpArticleModel.deleteOne({ _id });
    if (deletedCount > 0) console.log(`  removido: ${_id}`);
  }

  console.log(`\n${ARTICLES.length} artigos aplicados (audience=retaguarda, moduleKey=${MODULE_KEY}).`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao aplicar os artigos de ajuda:', error);
  process.exitCode = 1;
});
