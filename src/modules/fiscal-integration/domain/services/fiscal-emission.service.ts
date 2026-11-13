import { IOrder } from '../../../orders/domain/entities/order.entity';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IProductRepository } from '../../../catalog/domain/repositories/product.repository.interface';
import { EmitNfceInput, FocusNfeApiClient, FocusNfeDocumentResult, FocusNfeItemInput } from '../../infra/focus-nfe-client';
import { IFiscalConfig } from '../entities/fiscal-config.entity';
import { IFiscalConfigRepository } from '../repositories/fiscal-config.repository.interface';

/**
 * specs/0091-integracao-fiscal-focusnfe REQ-2 — código de forma de pagamento exigido pela
 * FocusNFe (Nota Técnica 2016.002, tabela de formas de pagamento da NFCe). `creditCardOnline`
 * mapeado como crédito (03): a FocusNFe não distingue "pago pelo app antes" de "pago na maquininha
 * na entrega" — é só o MEIO, que nos dois casos é cartão de crédito. Código `17` (PIX) é a
 * suposição menos confirmada deste client (ver `docs/FOCUSNFE.md`) — vale checar contra a doc
 * oficial completa antes de emitir em produção de verdade.
 */
const PAYMENT_METHOD_CODE: Record<IOrder['paymentMethod'], string> = {
  cash: '01',
  creditCard: '03',
  creditCardOnline: '03',
  debitCard: '04',
  pix: '17',
};

/** NCM genérico ("mercadorias em geral", capítulo de miscelânea) usado quando o produto não tem
 * `ncmCode` cadastrado (specs/0116) — emitir mesmo assim em vez de bloquear a venda; o operador
 * pode corrigir o NCM do produto depois (spec.md, "Fora de escopo": rateio fiscal fino por
 * produto não é objetivo da v1). */
const GENERIC_NCM = '21069090';
/** CFOP "venda de mercadoria adquirida ou recebida de terceiros, dentro do estado" — assunção
 * documentada (depende da UF real de cada venda, que esta v1 não calcula); CST/CSOSN `102`
 * ("tributada pelo Simples Nacional sem permissão de crédito") assume regime Simples Nacional,
 * o mais comum em restaurantes pequenos — nenhum dos dois é configurável ainda (ver
 * `docs/FOCUSNFE.md`, "Suposições assumidas"). */
const GENERIC_CFOP = '5102';
const GENERIC_ICMS_CST = '102';
const GENERIC_ICMS_ORIGEM = '0';
const GENERIC_UNIT = 'UN';

/**
 * specs/0091-integracao-fiscal-focusnfe REQ-2/REQ-4/REQ-6 — orquestra emissão automática,
 * reemissão manual e cancelamento do documento fiscal de um pedido. Validação de PRECONDIÇÃO
 * (pedido pertence ao restaurante, nota já emitida, etc.) fica no controller que chama este
 * serviço — mesmo raciocínio documentado em `ConfirmOnlinePaymentService` ("essa validação fica
 * fora deste serviço"): o que muda entre o gatilho automático e a ação manual do operador é a
 * resposta de erro esperada (automático: nunca lança, só loga; manual: o controller decide o
 * HTTP status), não a emissão em si.
 */
export class FiscalEmissionService {
  constructor(
    private readonly fiscalConfigRepository: IFiscalConfigRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly productRepository: IProductRepository,
    private readonly focusNfeBaseUrl: { homologacao: string; producao: string },
  ) {}

  private clientFor(config: IFiscalConfig): FocusNfeApiClient {
    const baseUrl = config.environment === 'producao' ? this.focusNfeBaseUrl.producao : this.focusNfeBaseUrl.homologacao;
    return new FocusNfeApiClient(config.focusNfeToken, baseUrl);
  }

  private async buildEmitInput(order: IOrder, cnpjEmitente: string): Promise<EmitNfceInput> {
    const products = await this.productRepository.listByRestaurant(order.restaurantId);
    // specs/0207-dados-fiscais-cadastro — produto inteiro (não só o NCM) pra resolver
    // cestCode/gtin/unit por item também (REQ-11/REQ-12/REQ-13).
    const productById = new Map(products.map((product) => [product.id, product]));

    const items: FocusNfeItemInput[] = order.items.map((item, index) => {
      const product = productById.get(item.productId);
      const unit = product?.unit ?? GENERIC_UNIT;
      return {
        numero_item: index + 1,
        codigo_ncm: product?.ncmCode || GENERIC_NCM,
        codigo_produto: item.productId,
        descricao: item.productName,
        quantidade_comercial: item.quantity,
        quantidade_tributavel: item.quantity,
        cfop: GENERIC_CFOP,
        valor_unitario_comercial: item.unitPrice,
        valor_unitario_tributavel: item.unitPrice,
        valor_bruto: Math.round(item.unitPrice * item.quantity * 100) / 100,
        unidade_comercial: unit,
        unidade_tributavel: unit,
        icms_origem: GENERIC_ICMS_ORIGEM,
        icms_situacao_tributaria: GENERIC_ICMS_CST,
        // REQ-11 — só enviado quando cadastrado (CEST só é obrigatório pra produto com
        // Substituição Tributária; omitir é o comportamento correto pros demais).
        ...(product?.cestCode ? { cest: product.cestCode } : {}),
        // REQ-12 — "SEM GTIN" quando ausente (convenção padrão de NFe), nunca omitido.
        gtin: product?.gtin ?? 'SEM GTIN',
        gtin_tributavel: product?.gtin ?? 'SEM GTIN',
      };
    });

    // specs/0080-troco-pagamento-dinheiro-checkout — `Order` não guarda a taxa de entrega como
    // item separado (`deliveryFee` é um campo agregado, `IOrder.deliveryFee`); quando houver,
    // some como uma linha adicional pra fechar o total do documento com `Order.total`.
    if (order.deliveryFee > 0) {
      items.push({
        numero_item: items.length + 1,
        codigo_ncm: GENERIC_NCM,
        codigo_produto: 'TAXA-ENTREGA',
        descricao: 'Taxa de entrega',
        quantidade_comercial: 1,
        quantidade_tributavel: 1,
        cfop: GENERIC_CFOP,
        valor_unitario_comercial: order.deliveryFee,
        valor_unitario_tributavel: order.deliveryFee,
        valor_bruto: order.deliveryFee,
        unidade_comercial: GENERIC_UNIT,
        unidade_tributavel: GENERIC_UNIT,
        icms_origem: GENERIC_ICMS_ORIGEM,
        icms_situacao_tributaria: GENERIC_ICMS_CST,
      });
    }

    return {
      // Achado real (13/11/2026, pedido explícito do usuário — analisar o payload de verdade
      // enviado à FocusNFe): `FiscalConfig.cnpj` é digitado pelo operador COM máscara
      // ("07.456.684/0001-80", `FiscalIntegrationPage.tsx` não aplica nenhuma, só valida o
      // dígito verificador via `isValidCnpj`, que internamente já ignora a máscara) — mas os
      // exemplos reais da documentação da FocusNFe mostram `cnpj_emitente` sempre como 14 dígitos
      // puros, sem pontuação ("51916585000125"). Enviar com máscara é a causa mais provável da
      // rejeição "Emissor não habilitado para emissão da NF-e/NFC-e" (SEFAZ 203: "emissor não
      // habilitado... ou o CNPJ informado está incorreto") mesmo com CSC/credenciamento OK.
      cnpj_emitente: cnpjEmitente.replace(/\D/g, ''),
      data_emissao: new Date().toISOString(),
      // '1' = operação presencial — convenção usada mesmo pra venda por delivery/app quando o
      // documento é NFCe de consumidor final (suposição documentada, `docs/FOCUSNFE.md`).
      presenca_comprador: '1',
      // '9' = sem ocorrência de transporte (entrega feita por motoboy próprio/app, não por
      // transportadora formal) — suposição documentada.
      modalidade_frete: '9',
      // '1' = operação interna (mesma UF do emitente) — esta v1 não verifica a UF real do
      // cliente; pedidos interestaduais exigiriam `local_destino` diferente.
      local_destino: '1',
      natureza_operacao: 'Venda de mercadoria',
      items,
      formas_pagamento: [{ forma_pagamento: PAYMENT_METHOD_CODE[order.paymentMethod], valor_pagamento: order.total }],
    };
  }

  /** REQ-2 — chamado no gatilho de status "entregue" (`OrdersController`). Nunca lança: qualquer
   * situação em que não deva emitir (sem config, produção sem o botão ligado, pedido cancelado,
   * já emitido) é um no-op silencioso; qualquer erro de verdade na chamada à FocusNFe vira
   * `Order.fiscal.status = 'rejeitado'` (REQ-4) em vez de propagar. */
  async emitForOrder(order: IOrder): Promise<void> {
    if (order.status === 'cancelado') return; // REQ-6 — nunca gera nota de pedido cancelado.
    if (order.fiscal?.status === 'emitido') return; // idempotência.

    const config = await this.fiscalConfigRepository.findByRestaurantId(order.restaurantId);
    if (!config) return;
    if (config.environment === 'producao' && !config.productionEnabled) return;
    // specs/0204-controle-emissao-fiscal-automatica REQ-2 — checagem irmã e independente da
    // acima: desligado, a emissão automática para por aqui nos 2 ambientes; `retryEmission`
    // (reemissão manual) nunca olha este campo, é o caminho que substitui a automação quando ela
    // está off (REQ-3).
    if (!config.autoEmitEnabled) return;
    // specs/0207-dados-fiscais-cadastro REQ-3 — Regime Normal nunca deriva CST automaticamente
    // (o CSOSN `102` usado hoje só vale pra Simples Nacional/MEI); em vez de emitir com código
    // tributário errado de propósito, a automática para aqui, com pendência explicando o motivo.
    // REQ-5: a reemissão manual CONTINUA liberada (não tem guard equivalente em `doEmit`), mas só
    // depois de um aviso de confirmação na tela (`OrderCard.tsx`/`ClosedOrdersPanel.tsx`) — sem
    // isso, bloquear só aqui não protegeria de nada, já que os dois caminhos chamam o mesmo
    // `doEmit` com o mesmo CSOSN genérico.
    if (config.taxRegime === 'regimeNormal') {
      await this.orderRepository.updateFiscal(order.id, {
        status: 'rejeitado',
        rejectedReason: 'Regime tributário Normal exige configuração de CST por produto — revisar com contador antes de emitir.',
      });
      return;
    }

    await this.orderRepository.updateFiscal(order.id, { status: 'pendente' });
    await this.doEmit(order, config);
  }

  /** REQ-4 — reemissão manual. Pressupõe que o controller já validou `order.fiscal?.status !==
   * 'emitido'` e que `config` existe/está liberada (produção com o botão ligado, ou
   * homologação) — ver docstring da classe. */
  async retryEmission(order: IOrder, config: IFiscalConfig): Promise<void> {
    await this.orderRepository.updateFiscal(order.id, { status: 'pendente' });
    await this.doEmit(order, config);
  }

  private async doEmit(order: IOrder, config: IFiscalConfig): Promise<void> {
    try {
      if (config.documentType !== 'nfce') {
        throw new Error(`Emissão de documentType "${config.documentType}" ainda não implementada nesta v1 (specs/0091)`);
      }

      const client = this.clientFor(config);
      const input = await this.buildEmitInput(order, config.cnpj);

      const result = await client.emitNfce(order.id, input);
      await this.applyResult(order.id, result);
    } catch (error) {
      await this.orderRepository.updateFiscal(order.id, {
        status: 'rejeitado',
        rejectedReason: error instanceof Error ? error.message : 'Erro desconhecido na emissão fiscal',
      });
      console.error(`[fiscal-integration] erro inesperado emitindo documento fiscal do pedido ${order.id}:`, error);
    }
  }

  private async applyResult(orderId: string, result: FocusNfeDocumentResult): Promise<void> {
    if (result.status === 'autorizado') {
      await this.orderRepository.updateFiscal(orderId, { status: 'emitido', ref: result.ref ?? orderId, documentUrl: result.caminho_danfe });
      return;
    }
    if (result.status === 'processando_autorizacao') {
      // Assíncrono: fica `pendente` até o webhook (`POST /webhooks/focusnfe/:restaurantId`)
      // trazer o resultado final.
      await this.orderRepository.updateFiscal(orderId, { status: 'pendente', ref: result.ref ?? orderId });
      return;
    }
    await this.orderRepository.updateFiscal(orderId, {
      status: 'rejeitado',
      ref: result.ref ?? orderId,
      rejectedReason: result.mensagem_sefaz ?? result.erros?.map((item) => item.mensagem).join('; ') ?? 'Documento rejeitado pela FocusNFe',
    });
  }

  /** REQ-3 — aplica o payload recebido no webhook ao pedido identificado por `ref` (== `Order.id`
   * nesta implementação, ver `FocusNfeApiClient`). */
  async applyWebhookResult(orderId: string, result: FocusNfeDocumentResult): Promise<void> {
    await this.applyResult(orderId, result);
  }

  /** REQ-6 — cancelamento da nota já emitida. Pressupõe que o controller já validou
   * `order.fiscal?.status === 'emitido'` (com `ref` presente). */
  async cancelDocument(order: IOrder, config: IFiscalConfig, justificativa: string): Promise<void> {
    const client = this.clientFor(config);
    const result = await client.cancelNfce(order.fiscal!.ref!, justificativa);
    if (result.status !== 'cancelado') {
      throw new Error(result.mensagem_sefaz ?? result.erros?.map((item) => item.mensagem).join('; ') ?? 'FocusNFe rejeitou o cancelamento da nota');
    }
    await this.orderRepository.updateFiscal(order.id, { status: 'cancelado', ref: order.fiscal!.ref, documentUrl: order.fiscal!.documentUrl });
  }
}
