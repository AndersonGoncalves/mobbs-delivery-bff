/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 2 (grupo "Cardápio", 7 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts` (ver o cabeçalho daquele arquivo pro processo completo de
 * captura de tela). Idempotente via `_id` determinístico.
 *
 * Revisão (follow-up, pedido explícito do usuário) — conteúdo bem mais detalhado que a primeira
 * versão, cobrindo campo a campo os formulários de Produtos/Matéria-prima/Grupos de Adicionais
 * (os cadastros mais complexos da retaguarda), com screenshots adicionais do formulário aberto,
 * não só da listagem. Cada `article()` agora pode receber mais de uma imagem — ver `withImages`.
 *
 * Uso: npm run seed:help-articles-cardapio
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle, HelpArticleStep } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/cardapio';

const MODULE_KEY = 'cardapio';
const MODULE_LABEL = 'Cardápio';
const MODULE_ORDER = 2;

/**
 * `steps` é uma lista de `[texto]` ou `[texto, imageKey]` — cada passo decide por conta própria
 * se leva imagem (e qual), em vez da convenção antiga de "só o passo de índice 1 tem foto". Isso
 * permite vários screenshots reais por artigo (ex. lista → formulário → seção específica do
 * formulário) nos cadastros mais ricos (Produtos, Matéria-prima, Grupos de Adicionais).
 */
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
  article(1, 'Cardápio', '/menu', 'cardapio', [
    ['Abra Cardápio > Cardápio. Aqui você organiza as categorias que dividem o cardápio do cliente (ex. "Lanches", "Pizzas", "Bebidas", "Sobremesas") — os produtos em si são cadastrados em Cardápio > Produtos, escolhendo uma dessas categorias.', 'cardapio'],
    ['Cada categoria mostra quantos produtos tem dentro. Use o botão ao lado dela pra ativar/desativar (categoria desativada some do cardápio do cliente inteira, produtos incluídos, sem precisar excluir nada) e as setas ↑/↓ pra reordenar — a ordem aqui é exatamente a ordem das abas que o cliente vê no cardápio do app.'],
    ['Clique no nome de uma categoria pra abrir o painel de edição: dá pra trocar o nome, adicionar uma foto (opcional — aparece como capa da categoria no cardápio do cliente) e marcar os "Dias ativos" (verde = ativo). Uma categoria com só alguns dias ativos (ex. só fim de semana, pra um cardápio de feijoada) some do cardápio do cliente fora desses dias, mesmo com produtos disponíveis dentro.', 'cardapio-categoria-form'],
    ['Excluir uma categoria só é permitido se ela estiver vazia (0 produtos) — o ícone de lixeira fica desabilitado enquanto houver produto dentro; mova ou exclua os produtos primeiro. Essa é uma proteção contra apagar sem querer um grupo inteiro de produtos.'],
    ['Pra criar uma categoria nova, digite o nome em "Nova categoria" (no fim da lista) e toque em ADICIONAR — ela entra como ativa, sem foto, sem dias ativos restritos (todos os dias), na última posição; reordene com as setas depois se precisar.'],
  ]),
  article(2, 'Produtos', '/products', 'produtos', [
    ['Abra Cardápio > Produtos. A listagem mostra foto, nome, categoria, preço e o switch "Disponível" de cada produto — use PESQUISAR (nome + disponibilidade) pra filtrar quando a lista crescer, e o switch da coluna pra tirar um produto do cardápio temporariamente (ex. acabou o ingrediente) sem excluir o cadastro.', 'produtos'],
    ['Pra editar, clique na linha do produto pra selecioná-la e use o ícone de lápis (Alterar) acima do grid — o mesmo padrão vale pra Copiar (duplica o cadastro inteiro, inclusive adicionais, como ponto de partida pra um produto parecido) e Excluir (exclusão real, só "dono" vê o botão). No celular, cada produto vira um cartão com um menu "⋮" com as mesmas 3 ações. Toque em NOVO pra abrir o mesmo formulário em branco.'],
    ['"Informações básicas": o switch "Disponível" é o primeiro campo (produto indisponível some do cardápio do cliente, mas mantém o cadastro — diferente de excluir); depois Nome, Descrição, Categoria de menu e Preço (obrigatórios os três primeiros, preço precisa ser maior que zero). "Controlar estoque deste produto" revela "Estoque atual" e "Estoque mínimo (alerta)" — ligado, o estoque desconta sozinho a cada venda e some do cardápio ao zerar; vale só pra produtos vendidos prontos (ex. bebida de garrafa), não pra pratos montados na hora. "Este item é bebida alcoólica" exibe a etiqueta +18 pro cliente no app.', 'produtos-form'],
    ['"Vitrine no app do cliente": três switches independentes — "Aparecer em Destaques" (seção de vitrine no topo do cardápio), "Aparecer em mais pedidos" e "Aparecer em peça também" (sugestão no carrinho) — e "Disponível como adicional", que libera este produto pra ser escolhido dentro do grupo de adicionais de OUTRO produto (ex. uma bebida como adicional de um combo). Esses switches são a mesma curadoria manual das telas Cardápio > Destaques/Mais pedidos/Peça também — mexer aqui ou lá dá no mesmo resultado.'],
    ['"Dados de retaguarda" (todos opcionais, nunca aparecem pro cliente): "ID do item no PDV" pra facilitar a busca na operação, "Custo do item" usado no relatório de lucratividade, "Código NCM" pra nota fiscal e "Praça de preparo" — texto livre (ex. "Chapa", "Bebida", "Montagem") usado pelo app da cozinha (KDS) pra agrupar/destacar os itens de cada praça.'],
    ['"Disponibilidade": "Dias ativos deste item" restringe o produto a certos dias da semana (ex. prato especial só às quintas), igual ao recurso de categoria, mas no nível do produto. "Este item deve ser exibido apenas em um horário específico" libera um intervalo início/fim (ex. um lanche só servido no jantar) — desligar o switch remove a restrição sem apagar os horários digitados, pra reativar rápido depois.'],
    ['"Fotos": até 5 fotos por produto, a primeira da lista é a usada no cardápio do cliente — use a estrela pra marcar qual é a "Principal" (reordena, não precisa ser a primeira adicionada). ENVIAR FOTO sobe um arquivo do computador; "Adicionar por link" aceita a URL de uma imagem já hospedada em outro lugar. Tamanho recomendado: até 1080×1080px.', 'produtos-adicionais'],
    ['"Adicionais": cada grupo (ex. "Bordas", "Acréscimos") define tipo Adicionar (soma itens ao pedido) ou Remover (tira um ingrediente, ex. "sem cebola"), se é obrigatório escolher algo, e o mínimo/máximo de opções que o cliente pode marcar. Cada opção tem nome + preço adicional, e pode ser "Manual" (texto livre), "Produto vinculado" (a opção é um produto já cadastrado, ex. "Coca-Cola" como acréscimo) ou "Matéria-prima vinculada" (consome estoque daquele ingrediente a cada venda, ex. "Bacon extra" descontando de Cardápio > Matéria-prima).'],
    ['No rodapé da lista de grupos, "Vincular grupo reutilizável" e "+ Adicionar grupo" são duas formas de incluir um grupo novo, lado a lado: escolha um já cadastrado em Cardápio > Grupos de Adicionais no combobox (editar o grupo lá atualiza automaticamente este e todos os outros produtos que o usam), OU toque em "Adicionar grupo" pra criar um grupo manual, digitado na hora só pra este produto. Dentro de um grupo manual, "Transformar em reutilizável" pega o que foi digitado e promove pra um template compartilhável, sem precisar recadastrar em Grupos de Adicionais depois.'],
  ]),
  article(3, 'Matéria-prima', '/raw-materials', 'materia-prima', [
    ['Abra Cardápio > Matéria-prima. Aqui ficam os ingredientes que compõem seus produtos (ex. "Pão de hambúrguer", "Queijo cheddar", "Mussarela") — diferente de Produtos, matéria-prima nunca aparece sozinha no cardápio do cliente; ela entra como opção vinculada de um Grupo de Adicionais ou como item de Estoque > Pedido de compra.', 'materia-prima'],
    ['Toque em NOVO: Nome é obrigatório; "Unidade de medida" é texto livre (ex. "kg", "un", "L" — use sempre a mesma grafia pro mesmo tipo de unidade, pra não espalhar "un"/"unid"/"und" como coisas diferentes nos relatórios). "Preço padrão (R$)" é sugerido automaticamente quando essa matéria-prima for usada como opção vinculada num grupo de adicionais (dá pra sobrescrever por produto). Uma foto opcional aparece junto da opção no cardápio do cliente quando ela é oferecida como adicional.', 'materia-prima-form'],
    ['"Controlar estoque desta matéria-prima" liga o desconto automático de estoque a cada venda de um produto/adicional vinculado a ela, e libera "Estoque mínimo (alerta)" pra ela aparecer destacada em vermelho em Estoque > Posição de estoque quando o saldo cair abaixo do mínimo. "Descrição" é opcional e aparece junto da opção quando a matéria-prima é escolhida como adicional (ex. detalhar "Bacon em cubos, defumado").'],
    ['Use o botão "Ativo" pra desativar uma matéria-prima usada em produtos (sem apagar o histórico nem o vínculo já salvo) — se ela estiver vinculada a algum produto ativo, o sistema avisa quais produtos antes de confirmar a desativação. "Editar"/"Copiar"/"Excluir" funcionam igual Produtos (clique na linha, ícones acima do grid); excluir é bloqueado se a matéria-prima já estiver em uso em algum produto, pra não quebrar um cadastro existente.'],
  ]),
  article(4, 'Grupos de Adicionais', '/additional-groups', 'grupos-adicionais', [
    ['Abra Cardápio > Grupos de Adicionais. São grupos reutilizáveis — vincule o mesmo grupo (ex. "Bordas de pizza") a quantos produtos quiser, e editar aqui atualiza todos os produtos vinculados de uma vez, sem precisar editar um por um. Pra um grupo exclusivo de um único produto, cadastre direto na aba "Adicionais" do formulário do produto (Cardápio > Produtos) em vez de criar um template aqui.', 'grupos-adicionais'],
    ['Toque em NOVO: "Nome do grupo", tipo Adicionar (soma itens, ex. "Acréscimos") ou Remover (tira ingrediente, ex. "Deseja remover algum ingrediente?"), "Obrigatório" (cliente precisa escolher algo nesse grupo pra fechar o pedido) e "Mín./Máx. seleções" (quantas opções o cliente pode marcar — ex. mín. 1 máx. 1 pra escolha única, como sabor de pizza).', 'grupos-adicionais-form'],
    ['Cada opção dentro do grupo tem nome + "Preço adicional (R$)" e pode ser Manual (texto livre), "Produto vinculado" ou "Matéria-prima vinculada" — mesmas 3 formas do construtor de adicionais dentro do produto; a diferença é que aqui o cadastro fica centralizado e reaproveitável.'],
    ['Desativar um grupo (botão "Ativo" na listagem) não desvincula nem apaga nada dos produtos que já o usam — eles continuam mostrando o grupo normalmente pro cliente; desativar só impede escolher esse grupo em NOVOS vínculos a partir de agora. Se o grupo estiver vinculado a produtos ativos, o sistema lista esses produtos antes de confirmar.'],
    ['Editar/Copiar/Excluir seguem o mesmo padrão de Produtos/Matéria-prima (clique na linha, ícones acima do grid, excluir só "dono"). Dentro de um produto, um grupo vinculado pode ser "Desvinculado" a qualquer momento — ele vira uma cópia congelada, independente do template, sem afetar os demais produtos que ainda usam o original.'],
  ]),
  article(5, 'Destaques', '/highlights', 'destaques', [
    ['Abra Cardápio > Destaques. Esta tela só mostra a lista — pra adicionar um produto aos destaques, vá no cadastro dele (Cardápio > Produtos) e ligue o switch "Aparecer em Destaques", na seção "Vitrine no app do cliente".'],
    ['Os produtos marcados aparecem aqui, nesta mesma ordem — use as setas ↑/↓ pra reorganizar como aparecem na vitrine do cardápio do cliente.', 'destaques'],
    ['Destaques são a seção de "vitrine" no topo do cardápio do cliente, geralmente a primeira coisa que ele vê ao abrir o cardápio — use pra promover o que você mais quer vender (lançamentos, maior margem, itens com estoque parado).'],
  ]),
  article(6, 'Mais pedidos', '/products/best-sellers', 'mais-pedidos', [
    ['Abra Cardápio > Mais pedidos. Igual aos Destaques: ligue "Aparecer em mais pedidos" no cadastro do produto (Cardápio > Produtos, seção "Vitrine no app do cliente") pra ele entrar nesta lista.'],
    ['A ordem aqui é a ordem de exibição no cardápio do cliente — use as setas ↑/↓ pra ajustar.', 'mais-pedidos'],
    ['É uma seleção manual sua, não automática — o sistema não calcula sozinho quais produtos venderam mais; você decide o que aparece aqui, mesmo que não bata exatamente com o ranking de vendas (ex. pra dar visibilidade a um produto novo).'],
  ]),
  article(7, 'Peça também', '/products/cart-suggestions', 'peca-tambem', [
    ['Abra Cardápio > Peça também. Ligue "Aparecer em peça também" no cadastro do produto (geralmente itens pequenos, como bebidas e sobremesas), na seção "Vitrine no app do cliente".'],
    ['Os produtos marcados aparecem no carrinho do cliente, sugerindo um item a mais antes de fechar o pedido — use as setas pra definir a ordem.', 'peca-tambem'],
    ['Boa prática: escolha itens de ticket baixo e fácil de adicionar (bebida, sobremesa) — aumenta o valor do pedido sem parecer forçado. Evite colocar aqui pratos principais caros, o efeito tende a ser o oposto (cliente hesita e às vezes nem fecha o pedido).'],
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
