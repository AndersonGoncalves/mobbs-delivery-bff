/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 1 (grupo "Restaurante", 12 itens). Idempotente: cada
 * artigo é identificado por um `_id` determinístico (`help-retaguarda-<moduleKey>-<itemSlug>`),
 * então rodar de novo apenas atualiza o conteúdo (upsert), nunca duplica.
 *
 * Uso: npm run seed:help-articles-restaurante
 *
 * As imagens referenciadas abaixo (`IMAGE_BASE/<item>.png`) foram capturadas com Playwright +
 * Chrome headless contra a retaguarda local (`http://127.0.0.1:5173`), logado como operador de um
 * restaurante de teste (`manual-ajuda`) com dado plausível preenchido em cada tela — processo
 * documentado em spec.md "Viabilidade de captura de tela". Publicar os PNGs no S3 antes de rodar
 * este script é responsabilidade de quem roda (ver README do grupo "Ajuda" em plan.md, ADR-3):
 *
 *   aws s3 cp <pasta-local-dos-pngs> s3://mobbs-delivery-images/platform/help/retaguarda/restaurante/ --recursive
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/restaurante';

const MODULE_KEY = 'restaurante';
const MODULE_LABEL = 'Restaurante';
const MODULE_ORDER = 1;

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
  article(1, 'Onboarding', '/settings/onboarding', 'onboarding', [
    'Abra Restaurante > Onboarding no menu lateral.',
    'Em "Endereço da sua loja na web", veja o link pronto do seu cardápio online (ex. bsdelivery.com.br/seu-slug) — toque em COPIAR para compartilhar com os clientes.',
    'Em "QR code / link para o app nativo", baixe ou mostre o QR code — é o caminho mais rápido para o cliente abrir seu cardápio pelo celular.',
    'Se quiser trocar o código da loja (o texto que aparece no link), edite "Código do restaurante (slug)" e toque em SALVAR NOVO CÓDIGO. Atenção: trocar o código invalida o link e o QR code antigos — quem já tinha salvo o link anterior deixa de funcionar.',
  ]),
  article(2, 'Perfil', '/settings/profile', 'profile', [
    'Abra Restaurante > Perfil.',
    'Em "Dados do perfil", preencha Nome, Telefone/WhatsApp de contato, CNPJ e o endereço completo (Rua, Número, Complemento, Bairro, Cidade, Estado, CEP).',
    'Use o botão "Aberto/Fechado" no topo da página para abrir ou fechar a loja manualmente a qualquer momento, além do horário de funcionamento configurado.',
    'Role a página para configurar logo, cores e outras opções visuais, depois toque em Salvar.',
  ]),
  article(3, 'Formas de Pagamento', '/settings/payment-methods', 'payment-methods', [
    'Abra Restaurante > Formas de Pagamento.',
    'Na coluna "Aceita no app", marque as formas que o cliente pode escolher no checkout: Dinheiro, Pix, Cartão de Débito/Crédito na maquininha, ou Cartão de Crédito Online (quando houver um gateway configurado em Integrações).',
    'Na coluna "Confirma pedido automaticamente", marque as formas em que o pedido pago já entra direto na fila de preparo (impressão automática), sem o operador precisar tocar em "Confirmar" manualmente.',
    'Toque em SALVAR.',
  ]),
  article(4, 'Horário de funcionamento', '/settings/business-hours', 'business-hours', [
    'Abra Restaurante > Horário de funcionamento.',
    'Ative o dia da semana no botão ao lado do nome (ex. "Segunda-feira") para que a loja funcione naquele dia.',
    'Preencha "Abre às" e "Fecha às" para cada dia ativo. Dias desativados (ex. Domingo) ficam sem os dois campos — a loja aparece fechada o dia inteiro.',
    'Toque em SALVAR HORÁRIOS. Esse horário decide automaticamente se a loja aparece aberta ou fechada pro cliente — use o botão "Aberto/Fechado" do Perfil só pra uma exceção pontual (ex. fechar mais cedo hoje).',
  ]),
  article(5, 'Entrega', '/settings/delivery', 'delivery', [
    'Abra Restaurante > Entrega.',
    'Em "Modalidades de pedido", marque Entrega e/ou Retirada — só o que for marcado aparece pro cliente escolher no checkout.',
    'Preencha o tempo estimado (mínimo e máximo, em minutos) de entrega e de retirada — esse tempo aparece pro cliente acompanhar o pedido.',
    'Em "Cálculo da taxa de entrega", escolha como a taxa é cobrada: valor fixo pra qualquer endereço, grátis, ou "Tabela por bairro".',
    'Se escolher "Tabela por bairro", role até "Taxa de entrega por bairro" e cadastre cada bairro com sua taxa (R$) — bairros sem valor cadastrado ficam sem taxa calculável, o que pode travar o checkout do cliente.',
  ]),
  article(6, 'Chave Pix', '/settings/pix', 'pix', [
    'Abra Restaurante > Chave Pix.',
    'Preencha "Chave Pix" com a chave que recebe o dinheiro (pode ser CPF, CNPJ, e-mail, telefone ou chave aleatória) e escolha o "Tipo da chave" correspondente.',
    'Preencha "Nome do beneficiário" exatamente como aparece na conta bancária dona da chave — é esse nome que aparece pro cliente conferir antes de pagar.',
    'Toque em SALVAR. A partir daí, todo pedido passa a gerar um Pix copia-e-cola automático — e o recibo de WhatsApp envia o código numa mensagem separada, só com ele, pra copiar com um toque.',
  ]),
  article(7, 'Notificações', '/settings/notifications', 'notifications', [
    'Abra Restaurante > Notificações.',
    'Em "Conexão do WhatsApp", toque em CONECTAR WHATSAPP e escaneie o QR code com o WhatsApp do celular do restaurante — sem essa conexão, nenhuma mensagem automática é enviada (o aviso "WhatsApp desconectado" some assim que conectar).',
    'Em "Mensagens por WhatsApp", cada tipo de mensagem (recibo do pedido, pedido confirmado, saiu pra entrega, etc.) tem o próprio liga/desliga — desative só o que não quiser enviar.',
    'Edite o texto de cada mensagem no campo abaixo dela; os textos entre chaves (ex. {nomeCliente}, {numeroPedido}) são preenchidos automaticamente pelo sistema — não apague as chaves, só o texto ao redor.',
  ]),
  article(8, 'App do cliente', '/settings/app', 'app', [
    'Abra Restaurante > App do cliente.',
    'Em "Identidade visual", toque em ENVIAR LOGO para subir a logo da loja (recomendado: até 1024×1024px).',
    'Escolha a "Cor primária do app" entre as opções prontas ou digite um código de cor — é a cor usada em botões e destaques no app do cliente.',
    'Ajuste também a "Cor do texto/ícone sobre a cor primária" e a "Cor do card de boas-vindas" para manter contraste e legibilidade.',
    'Role a página até o final e toque em Salvar.',
  ]),
  article(9, 'Operadores', '/settings/operators', 'operators', [
    'Abra Restaurante > Operadores.',
    'Toque em NOVO para cadastrar um operador: preencha nome, e-mail, WhatsApp e escolha o "Papel" (Dono, Gerente, Financeiro, Garçom, Motoboy ou Cozinha) — o papel decide quais páginas esse operador enxerga no menu.',
    'Pra um Gerente enxergar tudo igual ao Dono, ative "Acesso total" na linha dele.',
    'O operador cadastrado acessa com o próprio e-mail: ele faz login em "Entrar com Google" ou cria uma senha em "Foi convidado para operar um restaurante? Crie seu acesso aqui", na tela de login.',
  ]),
  article(10, 'Mesas', '/tables', 'tables', [
    'Abra Restaurante > Mesas.',
    'Toque em NOVA pra cadastrar uma mesa: dê um nome (ex. "Mesa 1") e, se quiser, a capacidade de lugares.',
    'Use FAIXAS pra cadastrar várias mesas de uma vez (ex. Mesa 1 a Mesa 10).',
    'Cada mesa cadastrada aqui aparece em Pedido > Atendimento de mesas, com o status Livre/Ocupada atualizado conforme os pedidos.',
  ]),
  article(11, 'Garçons', '/waiters', 'waiters', [
    'Abra Restaurante > Garçons.',
    'Esta tela só mostra a lista — pra cadastrar um garçom novo, toque no link "Operadores" (ou vá em Restaurante > Operadores) e crie um operador com o papel "Garçom".',
    'Depois de cadastrado, o garçom aparece aqui automaticamente, com nome, e-mail e um atalho de WhatsApp.',
    'O garçom faz login pelo próprio e-mail e abre a tela "Atendimento de mesas" pra lançar pedidos de mesa.',
  ]),
  article(12, 'Motoboys', '/motoboys', 'motoboys', [
    'Abra Restaurante > Motoboys.',
    'Igual aos garçons: pra cadastrar um motoboy, vá em Restaurante > Operadores (o link "Operadores" nesta própria tela leva direto pra lá) e crie um operador com o papel "Motoboy".',
    'Depois de cadastrado, o motoboy aparece aqui com nome, e-mail e atalho de WhatsApp.',
    'O motoboy faz login pelo próprio e-mail e usa "Minhas entregas" pra ver os pedidos atribuídos a ele e marcar como entregue.',
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
