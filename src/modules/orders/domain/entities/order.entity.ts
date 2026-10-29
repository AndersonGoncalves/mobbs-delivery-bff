export type OrderType = 'delivery' | 'pickup' | 'table';

/** `creditCardOnline` — specs/0101 REQ-9/specs/0170: pagamento com cartão cobrado online pelo
 * app (gateway real, Asaas ou Mercado Pago), distinto de `creditCard` (cartão combinado,
 * cobrado fora da plataforma na entrega/maquininha).
 * Pedido explícito do usuário — `bankTransfer` removido de todo o app (nunca foi usado de
 * verdade, sem pagamento real por trás). */
export type PaymentMethod = 'creditCard' | 'creditCardOnline' | 'debitCard' | 'pix' | 'cash';

export type OrderStatus = 'aguardandoConfirmacao' | 'confirmado' | 'emPreparo' | 'saiuParaEntrega' | 'entregue' | 'cancelado';

export type PaymentStatus = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

/**
 * docs/architecture/data-model.md §OrderItemSelection — mesma árvore de `CartItemSelection`
 * (specs/0004-carrinho), mas com nomes e `priceDelta` **congelados** (snapshot). Sem
 * `groupId`/`optionId` (diferente de `CartItemSelection`): não é mais editável depois de criado,
 * então os ids de grupo/opção do cardápio não servem pra nada aqui.
 */
export interface IOrderItemSelection {
  groupName: string;
  optionName: string;
  priceDelta: number;
  nestedSelections?: IOrderItemSelection[];
  /**
   * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — diferente dos outros
   * campos (nunca aceito do cliente): resolvido pelo próprio BFF em `POST /orders`, casando
   * `groupName`/`optionName` contra o `Product.additionalGroups` atual do `productId` do item
   * (mesmo raciocínio de "sem ids aqui" do comentário da interface — a única correlação possível
   * com o catálogo é por nome, não por id). Usado só pra baixa de estoque (`specs/0041`
   * `linkedProductId`) quando o pedido é entregue; `undefined` = opção sem vínculo, ou o vínculo
   * não pôde ser resolvido (produto/opção renomeado ou removido entre o pedido e a entrega).
   */
  linkedProductId?: string;
  /** specs/0108 — snapshot do adicional de matéria-prima para reserva/devolução. */
  rawMaterialId?: string;
}

/** docs/architecture/data-model.md §OrderItem — cópia congelada de `CartItem` (specs/0004). */
export interface IOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  selections?: IOrderItemSelection[];
  unitPrice: number;
  notes?: string;
  stockReservations?: IOrderItemStockReservation[];
}

export interface IOrderItemStockReservation {
  resourceType: 'product' | 'rawMaterial';
  resourceId: string;
  unitsPerItem: number;
  quantity: number;
  operationId: string;
}

export interface IOrderStatusHistory {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string;
  /**
   * specs/0008-acompanhamento-vendas REQ-3 — motivo do cancelamento pelo operador da retaguarda;
   * só presente quando `status === 'cancelado'` por essa via (cancelamento pelo próprio cliente,
   * specs/0006 REQ-6, não exige motivo).
   */
  reason?: string;
}

export interface ITableOrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  paidAt: string;
  paidBy: string;
}

export interface ITableOrderAdjustment {
  type: 'discount' | 'surcharge';
  mode: 'fixed' | 'percent';
  value: number;
  /** Pedido explícito do usuário — motivo do ajuste (ex. "quebrou um copo"), opcional, exibido
   * entre parênteses ao lado do valor na tela do PDV. */
  description?: string;
}

/**
 * docs/architecture/data-model.md §Order. `deliveryAddress` aqui é uma **string simplificada**
 * nesta v1 (não o `Address` estruturado de `specs/0011-perfil-cliente`, que ainda não existe —
 * ver `specs/0005-checkout/tasks.md`, nota de implementação) — quando `0011` chegar, revisitar
 * pra usar `IRestaurantAddress`-like shape em vez de string livre.
 */
export interface IOrder {
  id: string;
  orderNumber: number;
  trackingToken: string;
  idempotencyKey?: string;
  customerId: string;
  restaurantId: string;
  items: IOrderItem[];
  orderType: OrderType;
  /**
   * specs/0155-app-totem-autoatendimento REQ-14 — distingue um pedido criado pelo totem físico
   * de um pedido comum do app cliente, sem introduzir um `OrderType` novo (ADR do plano:
   * `orderType` continua `'pickup'`, só este campo aditivo marca a origem). Ausente = app
   * cliente (comportamento de todo pedido já existente antes desta spec).
   */
  /**
   * specs/0174-pdv-extensao-chrome-lateral REQ-22 — pedido criado por um operador (PDV web ou
   * extensão Chrome) em nome do cliente selecionado (ou do atendimento anônimo de balcão), nunca
   * pelo próprio operador "virando" cliente. Distinto de `source` ausente (app cliente) e de
   * `'totem'` (autoatendimento sem operador logado).
   *
   * specs/0090-integracao-ifood REQ-3 — `'ifood'` marca um pedido recebido via polling da API do
   * iFood (`IFoodPollingWorker`), nunca criado pelo cliente/operador/totem diretamente.
   *
   * specs/0199-painel-pedidos-por-periodo AC-4 — `'comanda'` marca uma mesa aberta pelo app
   * `mobbs-delivery-comanda` (garçom no tablet), distinto de uma mesa aberta pela retaguarda web
   * (`TableServicePage.tsx`, que grava `source` ausente, igual sempre foi).
   *
   * specs/0122-integracao-99food REQ-4 — `'99food'` marca um pedido recebido via webhook da API
   * do 99Food (`NinetyNineFoodWebhookController`, evento `orderNew`), nunca criado pelo
   * cliente/operador/totem diretamente.
   */
  source?: 'totem' | 'operador-web' | 'operador-extensao' | 'ifood' | 'comanda' | '99food';
  /** specs/0174-pdv-extensao-chrome-lateral REQ-22 — id do operador que finalizou a venda, só
   * presente quando `source` é `'operador-web'`/`'operador-extensao'`. Rastreabilidade, nunca usado
   * pra autorização (quem decide o que o operador pode fazer é `req.operatorRole`, resolvido a
   * cada requisição). */
  operatorId?: string;
  deliveryAddress?: string;
  /** specs/0125 — snapshot do motoboy atribuído pela retaguarda, quando houver. */
  deliveryMotoboy?: { id: string; name: string };
  /** specs/0120 — snapshot de mesa/balcão e garçom informativo do pedido de salão. */
  tableId?: string;
  tableName?: string;
  tableWaiter?: { id: string; name: string };
  serviceChargePercent?: number;
  serviceChargeAmount?: number;
  coverCharge?: number;
  tableAdjustment?: ITableOrderAdjustment;
  tablePeopleCount?: number;
  tablePayments?: ITableOrderPayment[];
  tableClosedAt?: string;
  tableMergedIntoOrderId?: string;
  notes?: string;
  status: OrderStatus;
  statusHistory: IOrderStatusHistory[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  /**
   * specs/0022-cupons-desconto REQ-2/REQ-4 — código do cupom aplicado (já normalizado,
   * maiúsculo), quando algum; `Order.discount` acima é o valor calculado a partir dele. Guardado
   * pra rastreabilidade (REQ-6: contagem de uso por cliente, `countByCustomerAndCoupon`) — não
   * referencia `Coupon.id` porque o cupom pode ser editado/desativado depois sem perder o
   * histórico de qual código o pedido usou.
   */
  couponCode?: string;
  /**
   * specs/0131-cashback-app REQ-4/REQ-5 — valor de saldo de cashback resgatado neste pedido
   * (reais), já debitado do saldo do cliente na criação (`CustomerBalanceService.
   * debitRedemption`). `0`/ausente = nenhum resgate. `Order.total` já é líquido deste valor
   * (`total = subtotal + deliveryFee - discount - cashbackUsed`).
   */
  cashbackUsed?: number;
  paymentMethod: PaymentMethod;
  /**
   * specs/0080-troco-pagamento-dinheiro-checkout REQ-2 — só faz sentido com `paymentMethod ===
   * 'cash'`; opcional mesmo nesse caso ("se não precisar, deixe em branco" — sem validação de
   * negócio, é só informativo pro entregador separar o troco).
   */
  cashChangeFor?: number;
  createdAt: string;
  estimatedDeliveryAt?: string;
  /** specs/0139 + specs/0176 — `'printed'` é gravado quando o bridge local confirma ou o
   * operador confirma explicitamente a impressão manual; ausência significa "ainda não impresso" (a fila de
   * impressão automática é calculada ao vivo por `status === 'confirmado'`, sem precisar marcar
   * nada como "pendente" na criação/confirmação do pedido). */
  autoPrintStatus?: 'printed';
  /**
   * specs/0091-integracao-fiscal-focusnfe REQ-2/REQ-3/REQ-4/REQ-5/REQ-6 — status da emissão do
   * documento fiscal (NFCe/CFe/NFe) via FocusNFe. Ausente = restaurante sem integração fiscal
   * configurada (`FiscalConfig`) OU pedido ainda não atingiu o gatilho de emissão ("entregue") —
   * nunca confundir ausência com "rejeitado". `ref` é o identificador que O PRÓPRIO BFF escolhe
   * ao emitir (usa `Order.id`) e devolve pra FocusNFe via query param `ref` — é o mesmo valor
   * usado depois pra consultar/cancelar o documento.
   */
  fiscal?: IOrderFiscal;
  /**
   * specs/0121-integracao-uber-entregas REQ-2/REQ-3/REQ-4/REQ-6 — entrega avulsa via Uber Direct,
   * despachada manualmente pelo operador (REQ-4, nunca automático). Ausente = pedido sem entrega
   * via Uber (usa motoboy próprio, ou ainda não despachado). Status mapeado do enum bruto da
   * Uber: `pending`→`solicitado`, `pickup`/`pickup_complete`→`aceito`, `dropoff`→`a_caminho`,
   * `delivered`→`entregue`, `canceled`/`returned`→`cancelado`.
   */
  uberDelivery?: IOrderUberDelivery;
  /**
   * specs/0122-integracao-99food — id do pedido no sistema da 99Food (inteiro de 64 bits,
   * guardado como string pra não perder precisão — `json-bigint` no webhook). Só presente quando
   * `source === '99food'`; usado por `tryConfirmOrderVia99Food`/`tryCancelOrderVia99Food` pra
   * confirmar/cancelar na API deles. Nunca usar `order.id` (nosso `_id` interno) pra isso — ver
   * nota de risco em `specs/0122-integracao-99food/plan.md` sobre o equivalente do iFood.
   */
  ninetyNineFoodOrderId?: string;
}

export type FiscalDocumentStatus = 'pendente' | 'emitido' | 'rejeitado' | 'cancelado';

export interface IOrderFiscal {
  status: FiscalDocumentStatus;
  /** Igual a `Order.id` — ver comentário acima. */
  ref?: string;
  /** Caminho/URL do DANFCe (HTML) devolvido pela FocusNFe quando `status === 'emitido'`. */
  documentUrl?: string;
  /** Motivo da rejeição (SEFAZ) ou mensagem de erro técnico, só quando `status === 'rejeitado'`. */
  rejectedReason?: string;
}

export type UberDeliveryStatus = 'solicitado' | 'aceito' | 'a_caminho' | 'entregue' | 'cancelado';

export interface IOrderUberDelivery {
  status: UberDeliveryStatus;
  /** Id da entrega na Uber Direct (prefixo `del_`), usado pra resolver o pedido no webhook. */
  deliveryId?: string;
  quoteId?: string;
  trackingUrl?: string;
}

/**
 * docs/architecture/data-model.md §Payment — registro separado do `Order` (usado por
 * `specs/0008-acompanhamento-vendas` mais adiante); o cliente nunca lê isso de volta nesta v1,
 * só o BFF grava pra retaguarda.
 */
export interface IPayment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  cardBrand?: string;
  status: PaymentStatus;
  amount: number;
  /** specs/0101-integracao-asaas (fase 1) — id da cobrança no Asaas (`pay_...`), quando o Pix
   * foi cobrado via gateway em vez de BR Code local com chave direta. */
  externalReference?: string;
  /** specs/0101-integracao-asaas (fase 1) — copia-e-cola Pix devolvido pelo Asaas na criação da
   * cobrança (`GET /payments/:id/pixQrCode`), persistido porque (diferente do BR Code local,
   * `buildOrderPixCode`, calculado on-demand) só existe depois de uma chamada de API — não dá
   * pra recalcular a cada `GET`. `attachPaymentDetails`/`whatsapp-confirmation-message` preferem
   * este valor sobre `buildOrderPixCode` quando presente. */
  pixPayload?: string;
  /** specs/0170-integracao-mercado-pago — URL de checkout hospedado (`init_point` do Mercado
   * Pago Checkout Pro) pro app abrir numa WebView quando `method === 'creditCardOnline'`.
   * Genérico de propósito (não "mercadoPagoInitPoint"): qualquer gateway futuro baseado em
   * checkout hospedado pode reaproveitar o mesmo campo. */
  checkoutUrl?: string;
}

/**
 * docs/architecture/data-model.md §SalesSummary — agregado calculado on demand
 * (`specs/0008-acompanhamento-vendas` REQ-4), nunca persistido. `totalRevenue` soma só pedidos
 * `entregue` (receita realizada); `totalOrders` conta todos os pedidos criados no período,
 * independente do status.
 */
export interface ISalesSummary {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  totalOrders: number;
  totalRevenue: number;
  tableRevenue: number;
  cancelledOrders: number;
}
