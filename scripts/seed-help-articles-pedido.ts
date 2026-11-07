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
 * Revisão (follow-up, pedido explícito do usuário) — "Atendimento de mesas" ganhou o fluxo
 * completo de verdade (abrir mesa, lançar item, fechar conta, ver no histórico de "Fechados") e
 * cobre balcão explicitamente, não só mesa; "Pedidos do app" mostra o quadro com pedido em mais
 * de uma coluna; "Clientes" ganha um passo pra cada botão da barra de ações (Editar/Ver pedidos/
 * Ver endereços/Meios de pagamento/Cashback e fidelidade), cada um com seu próprio screenshot.
 *
 * Uso: npm run seed:help-articles-pedido
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle, HelpArticleStep } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/pedido';

const MODULE_KEY = 'vendas';
const MODULE_LABEL = 'Pedido';
const MODULE_ORDER = 3;

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
  article(1, 'PDV', '/operator-pdv', 'pdv', [
    ['Abra Pedido > PDV.', 'pdv'],
    ['Escolha o tipo do pedido: DELIVERY, RETIRADA ou BALCÃO.'],
    ['Pra delivery/retirada, digite o telefone do cliente e toque em BUSCAR (carrega os dados se ele já pediu antes) ou CADASTRO RÁPIDO pra um cliente novo; preencha o endereço de entrega se for delivery.'],
    ['Em "Itens", busque e adicione os produtos do cardápio, escolha a forma de pagamento e toque em REVISAR E FINALIZAR.'],
    ['Use as abas "PEDIDO 1"/"PEDIDO 2" pra montar mais de um pedido ao mesmo tempo, sem perder o que já estava digitando no outro.'],
  ]),
  article(2, 'Pedidos do app', '/orders', 'pedidos-app', [
    ['Abra Pedido > Pedidos do app — pedidos de delivery/retirada feitos pelo cliente no app, do momento que chegam até a entrega.'],
    ['A aba PEDIDOS mostra um quadro Kanban, uma coluna por status (Aguardando confirmação, Confirmado, Em preparo, Saiu para entrega), cada um podendo ter vários pedidos ao mesmo tempo. Cada card mostra cliente, WhatsApp, itens, endereço (ou "Retirada no local"), forma de pagamento e total.', 'pedidos-app'],
    ['O botão de avançar o pedido muda conforme o status e o tipo: CONFIRMAR (aguardando → confirmado), INICIAR PREPARO (confirmado → em preparo) e, dali, SAIU PARA ENTREGA pra delivery ou PRONTO PARA RETIRADA pra retirada — cada card também tem CANCELAR e IMPRIMIR.'],
    ['A aba MAPA mostra todos os pedidos do dia espalhados num mapa, cada um com uma cor conforme o status (legenda no topo) — útil pra entender a distribuição geográfica das entregas ou planejar rotas. Clique num marcador pra ver os detalhes daquele pedido.'],
    ['A aba ENTREGUES guarda o histórico dos pedidos já finalizados, com total do período.'],
  ]),
  article(3, 'Atendimento de mesas', '/table-service', 'atendimento-mesas', [
    ['Abra Pedido > Atendimento de mesas — mesas cadastradas (Restaurante > Mesas) aparecem como blocos verdes (livres); toque numa pra abrir uma comanda nova, ou numa mesa ocupada (amarela) pra continuar lançando itens.', 'atendimento-mesas'],
    ['Com a comanda aberta, busque produtos no campo "Buscar no cardápio" e toque no card do produto pra adicionar — se ele tiver um grupo de adicionais obrigatório (ex. "Bordas" de uma pizza), escolha a opção antes de "Adicionar ao pedido". Use os botões "−"/"+" na lista da comanda pra ajustar a quantidade de um item já lançado, ou "Agrupar iguais" pra juntar linhas repetidas do mesmo produto/adicionais/observação.', 'atendimento-mesa-aberta'],
    ['Taxa de serviço, Couvert (só em dias com música ao vivo configurados em Restaurante > Mesas), desconto/acréscimo e divisão informativa por número de pessoas ficam logo abaixo da comanda — cada um se aplica na hora, sem precisar fechar a conta pra ver o efeito no total.'],
    ['Toque em "Fechar conta": confira o saldo, escolha a forma de pagamento (ou mais de uma — ADICIONAR FORMA DE PAGAMENTO pra dividir entre dinheiro/Pix/cartão) e confirme. O fechamento já dispara a impressão da conta automaticamente.', 'atendimento-fechar-conta'],
    ['NOVO BALCÃO (botão no topo da página) abre o mesmo tipo de comanda, só que sem reservar uma mesa — pra atender alguém no balcão ou Drive-Thru, sem vincular a uma mesa física. Funciona exatamente igual: buscar produto, lançar item, fechar conta.', 'atendimento-balcao'],
    ['Depois de fechada, a comanda (de mesa ou de balcão) sai da aba MESAS e aparece na aba FECHADOS, com total do período e a forma de pagamento usada — é esse fechamento que gera o repasse de garçom (Caixa > Repasses de Garçons) e a venda de mesa/balcão no Caixa.', 'atendimento-fechados'],
  ]),
  article(4, 'Minhas entregas', '/my-deliveries', 'minhas-entregas', [
    ['Esta tela só aparece pra operadores com o papel "Motoboy" (ver Restaurante > Operadores) — dono/gerente acompanham tudo em Pedido > Pedidos do app.'],
    ['Abra Pedido > Minhas entregas (menu do próprio motoboy).', 'minhas-entregas'],
    ['Veja só os pedidos atribuídos a você, com endereço, WhatsApp do cliente e total.'],
    ['Toque em MARCAR COMO ENTREGUE assim que concluir a entrega — isso atualiza o status pro cliente e conta pro seu repasse (Caixa > Repasses de Motoboys).'],
  ]),
  article(5, 'Clientes', '/customers', 'clientes', [
    ['Abra Pedido > Clientes — lista só de clientes que já fizeram pelo menos um pedido no seu restaurante (não é um cadastro livre). Use PESQUISAR (nome/telefone) e o filtro de período "De"/"Até" pra ver "Pedidos no período"/"Gasto no período" em vez do total histórico.', 'clientes'],
    ['NOVO cadastra um cliente manualmente (útil pra atendimento por telefone, sem passar pelo app) — só dono/gerente vê esse botão. Clique na linha do cliente pra selecioná-lo e usar a barra de ações: "Editar" (lápis) altera nome/telefone do cliente selecionado, também restrito a dono/gerente.', 'clientes-editar'],
    ['"Ver pedidos" (olho) abre o histórico completo de pedidos daquele cliente — número, data, status e total de cada um, mais recente primeiro.', 'clientes-ver-pedidos'],
    ['"Ver endereços" (pino) lista os endereços salvos pelo cliente no app, com o selo "Padrão" no principal — NOVO ENDEREÇO cadastra um novo a partir daqui, e o ícone de lápis em cada um edita.', 'clientes-ver-enderecos'],
    ['"Meios de pagamento" (cartão) restringe quais formas esse cliente específico pode usar no checkout — sem nenhuma marcada, ele pode usar qualquer forma que o restaurante aceita; marcando alguma(s), só essas ficam disponíveis pra ele.', 'clientes-meios-pagamento'],
    ['"Cashback e fidelidade" (medalha) mostra o saldo de crédito disponível desse cliente e o progresso dele no programa de fidelidade (ex. "3 de 10 pedidos" pra ganhar a recompensa) — os percentuais/metas em si são configurados em Pedido > Cashback e Fidelidade, pro restaurante inteiro.', 'clientes-cashback'],
  ]),
  article(6, 'Bloquear cliente', '/block-customer', 'bloquear-cliente', [
    ['Abra Pedido > Bloquear cliente.'],
    ['Se aparecer "O bloqueio de clientes está desabilitado", vá em Configurações > Geral e ligue a opção antes de continuar.', 'bloquear-cliente'],
    ['Com o bloqueio habilitado, digite o celular com DDD do cliente e toque em BLOQUEAR — esse número não consegue mais fazer pedidos no seu restaurante.'],
    ['Pra desbloquear, toque no ícone de lixeira na linha do cliente bloqueado.'],
  ]),
  article(7, 'Avaliações', '/ratings', 'avaliacoes', [
    ['Abra Pedido > Avaliações.'],
    ['Veja as notas (1 a 5 estrelas) e comentários deixados pelos clientes depois do pedido.', 'avaliacoes'],
    ['Toque em "Responder" pra escrever uma resposta pública, que aparece logo abaixo do comentário do cliente — útil pra agradecer um elogio ou esclarecer uma reclamação.'],
    ['Avaliações não podem ser excluídas nem editadas pelo restaurante — só respondidas.'],
  ]),
  article(8, 'Cupons de desconto', '/coupons', 'cupons', [
    ['Abra Pedido > Cupons de desconto.'],
    ['Toque em NOVO: defina o código (o que o cliente digita no checkout), o tipo de desconto (percentual ou valor fixo), o valor mínimo do pedido, o período de validade e os limites de uso (total e por cliente).', 'cupons'],
    ['Use o botão "Ativo" pra ligar/desligar um cupom sem precisar excluí-lo.'],
    ['A coluna "Uso" mostra quantas vezes o cupom já foi usado em relação ao limite configurado.'],
  ]),
  article(9, 'Promoções', '/promotions', 'promocoes', [
    ['Abra Pedido > Promoções.'],
    ['Toque em NOVA: dê um nome pra promoção, o percentual de desconto e selecione quais produtos entram (ex. "todas as pizzas"), com data de início e fim.', 'promocoes'],
    ['Produtos em promoção ganham uma tag de desconto automaticamente no cardápio do cliente — o preço já aparece com o desconto aplicado.'],
    ['Use o botão "Ativa" pra pausar uma promoção antes da data de fim, se precisar.'],
  ]),
  article(10, 'Cashback e Fidelidade', '/settings/cashback-fidelidade', 'cashback-fidelidade', [
    ['Abra Pedido > Cashback e Fidelidade.'],
    ['Em "Cashback", defina o percentual que o cliente ganha de volta (em crédito) em cada pedido entregue — deixe em branco ou 0 pra desligar.', 'cashback-fidelidade'],
    ['Em "Programa de fidelidade", defina quantos pedidos o cliente precisa completar pra ganhar uma recompensa em R$, e o valor mínimo de pedido que conta pro cartão — deixe os campos em branco pra desligar.'],
    ['Toque em SALVAR. O crédito acumulado (cashback + fidelidade) fica disponível pro cliente usar em pedidos futuros no seu restaurante — e aparece individualmente em Pedido > Clientes, botão "Cashback e fidelidade" de cada cliente.'],
  ]),
  article(11, 'Campanhas', '/campaigns', 'campanhas', [
    ['Abra Pedido > Campanhas.'],
    ['Conecte o WhatsApp do restaurante primeiro (botão CONECTAR WHATSAPP) — sem conexão não dá pra disparar campanhas.', 'campanhas'],
    ['Escreva a mensagem em "Mensagem" — o link do cardápio e o link de descadastro são adicionados automaticamente; use {linkCardapio} e {linkDescadastro} pra escolher onde eles entram no texto.'],
    ['Se quiser, exclua clientes específicos do disparo em "Excluir clientes deste disparo", e envie. Atenção ao aviso: envio em massa tem risco real de bloqueio do número — use com moderação, o disparo é sempre manual.'],
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
