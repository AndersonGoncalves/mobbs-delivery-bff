/**
 * specs/0105-modulo-ajuda-retaguarda — Fase 10 (grupo "Integrações", 6 itens). Mesmo molde de
 * `seed-help-articles-restaurante.ts`. Idempotente via `_id` determinístico.
 *
 * Todas as 6 telas foram capturadas no estado padrão "não conectado" — não há como vincular de
 * verdade nenhuma dessas integrações a partir do restaurante de teste local sem credenciais reais
 * (criaria vínculos de verdade com Asaas/Mercado Pago/iFood/99Food/FocusNFe/Uber, ou dispararia
 * chamadas reais a essas APIs externas com as credenciais de produção configuradas neste BFF — ver
 * plan.md, ADR-3). O passo a passo de cada artigo descreve o fluxo completo (inclusive o estado
 * conectado) lendo o código de cada página, não só o que a screenshot mostra.
 *
 * Uso: npm run seed:help-articles-integracoes
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { HelpArticleModel } from '../src/modules/help/infra/help-article.mongoose.model';
import type { NewHelpArticle } from '../src/modules/help/domain/help-article';

const IMAGE_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/platform/help/retaguarda/integracoes';

const MODULE_KEY = 'integracoes';
const MODULE_LABEL = 'Integrações';
const MODULE_ORDER = 10;

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
  article(1, 'Asaas', '/settings/asaas', 'asaas', [
    'Abra Integrações > Asaas.',
    'Preencha os dados da subconta (nome/razão social, e-mail, CPF ou CNPJ, data de nascimento, celular, faturamento mensal e endereço completo) e toque em ATIVAR COBRANÇA PIX PELO ASAAS.',
    'Com a subconta cadastrada, o Pix do checkout passa a ser cobrado de verdade pelo Asaas — o pagamento é confirmado automaticamente, sem precisar checar manualmente se o Pix caiu na conta; o dinheiro vai direto pra sua própria subconta.',
    'Depois de ativo, os campos ficam travados (só "Desvincular" fica disponível); pra trocar pra uma conta Asaas diferente (outro CPF/e-mail), use "Vincular outra conta" — a subconta anterior fica guardada em "Subcontas anteriores", com um botão "Reconectar" pra voltar a usar ela sem recadastrar.',
  ]),
  article(2, 'Mercado Pago', '/settings/mercadopago', 'mercado-pago', [
    'Abra Integrações > Mercado Pago.',
    'Toque em VINCULAR COM MERCADO PAGO: a autorização abre em outra aba, sem sair da retaguarda — faça login com a conta Mercado Pago da loja.',
    'Depois de autorizado, volte pra retaguarda e toque em "Atualizar vínculo" (aviso que aparece na tela) pra confirmar a conexão.',
    'Pra habilitar pro cliente: em Restaurante > Formas de Pagamento, ligue "Cartão de Crédito Online" e salve — depois reabra o app da loja pra carregar a configuração atualizada.',
  ]),
  article(3, 'iFood', '/settings/ifood', 'ifood', [
    'Abra Integrações > iFood.',
    'Preencha Merchant ID, Client ID e Client Secret (obtidos no Portal do Parceiro iFood — iFood for Developers, ao registrar sua aplicação lá, não aqui no sistema) e toque em CONECTAR IFOOD.',
    'Com a integração conectada, pedidos feitos no iFood passam a aparecer no mesmo lugar onde você já gerencia os pedidos do seu canal próprio (Pedido > Pedidos do app), com um aviso identificando que vieram do iFood.',
    'Pra desconectar, use o botão "Desvincular" que aparece no lugar do formulário assim que a integração estiver ativa.',
  ]),
  article(4, '99Food', '/settings/99food', '99food', [
    'Abra Integrações > 99Food.',
    'Toque em GERAR LINK PARA AUTORIZAR: o link abre em outra aba, onde você escolhe sua loja no site do 99Food e autoriza a vinculação.',
    'Depois de autorizar lá, volte aqui — o status muda pra "conectado" sozinho (chega por um aviso automático do 99Food, sem precisar de nenhuma ação extra nesta tela).',
    'Já conectado, aparece também o card "99 Entrega": ative pra poder solicitar um entregador avulso da 99 nos pedidos vindos do 99Food que você despacha com motoboy próprio, quando a capacidade própria não for suficiente.',
  ]),
  article(5, 'Fiscal', '/settings/fiscal', 'fiscal', [
    'Abra Integrações > Fiscal — emissão de nota fiscal (NFCe) por pedido, pela FocusNFe.',
    'Preencha o Token de acesso (gerado no painel da própria FocusNFe, depois de cadastrar lá o CNPJ/regime tributário/certificado digital), o CNPJ do emitente, o Ambiente (Homologação ou Produção) e o Documento fiscal (NFCe/CFe/NFe), e toque em SALVAR CONFIGURAÇÃO.',
    'Comece sempre em "Homologação (testes)" — só depois de confirmar que a emissão funciona ali é que compensa trocar pra "Produção".',
    'Quando o ambiente estiver em Produção, um card extra aparece com o interruptor "Ativar emissão em produção": enquanto desligado, nenhuma nota é emitida automaticamente, mesmo com o ambiente já em produção — uma segunda trava deliberada, já que nota fiscal errada é problema tributário de verdade.',
  ]),
  article(6, 'Uber Entregas', '/settings/uber-direct', 'uber-entregas', [
    'Abra Integrações > Uber Entregas — pedir um entregador avulso da Uber pra um pedido específico, quando não tiver motoboy próprio disponível.',
    'Preencha o Uber ID de cliente do desenvolvedor, ID do usuário, Client Secret e CEP de origem (credenciais geradas no portal de desenvolvedor da Uber, fora do sistema) e toque em SALVAR CONFIGURAÇÃO.',
    'Diferente de outras integrações, não existe um interruptor de "ativar"/"produção": o despacho é sempre manual, pedido por pedido — o próprio ato de tocar em "Despachar via Uber Entregas" num pedido (tela de Pedido) já é a confirmação.',
    'Pra trocar as credenciais depois de conectado, desvincule e reconecte com os dados novos.',
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
