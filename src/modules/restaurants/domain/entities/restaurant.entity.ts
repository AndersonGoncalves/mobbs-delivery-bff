import { PaymentMethod } from '../../../orders/domain/entities/order.entity';

export interface IBusinessHours {
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  isClosed: boolean;
  openTime?: string;
  closeTime?: string;
}

export type PixKeyType = 'telefone' | 'cpf' | 'cnpj' | 'email' | 'aleatoria';

/**
 * Endereço do estabelecimento (não do cliente, docs/architecture/data-model.md §Address) — só os
 * campos físicos, sem `customerId`/`label`/`isDefault`/coordenadas (exclusivos do endereço de
 * entrega do `Customer`).
 */
export interface IRestaurantAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Campos de specs/0009-resolucao-restaurante (REQ-1/REQ-9: resolver + branding) mais os novos de
 * specs/0010-configuracao-restaurante (REQ-1, REQ-8, REQ-9, REQ-10) — docs/architecture/data-model.md
 * tem o Restaurant completo; os campos ainda não usados por nenhuma spec implementada (category,
 * description, bannerUrl, rating, deliveryFeeCents, estimatedDeliveryMinutes, whatsappConnected)
 * ficam de fora até a spec que os usa (0003/0006/0013) chegar.
 */
export interface IRestaurant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  businessHours: IBusinessHours[];
  logoUrl?: string;
  primaryColor?: string;
  /**
   * specs/0029-ajustes-carrinho-perfil-restaurante-diversos — cor do texto/ícone mostrado em
   * cima de `primaryColor` (ex.: o texto do botão "Adicionar"). Junto com `primaryColor`, forma
   * o par `primary`/`onPrimary` do tema do app (`docs/architecture/patterns.md`, convenção do
   * Material Design: toda cor de fundo tem uma cor "on" companheira pra garantir contraste).
   */
  onPrimaryColor?: string;
  /** specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-1 — usada como fallback
   * quando um produto não tem `imageUrl` próprio (antes do asset genérico embutido no app,
   * `specs/0029` REQ-5). */
  defaultProductImageUrl?: string;
  address?: IRestaurantAddress;
  phone?: string;
  /** specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-4 — CNPJ, mostrado no perfil
   * público do restaurante (app cliente). */
  document?: string;
  minimumOrderValue: number;
  /**
   * specs/0004-carrinho — taxa de entrega fixa nesta v1 (docs/architecture/data-model.md,
   * `deliveryFeeCents`; sem cálculo por distância). Default 0. Editável pela retaguarda (campo
   * "Valor da taxa de entrega", só quando `deliveryFeeMode === 'fixed'`) desde
   * `specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login` REQ-1 — usado direto só
   * nesse modo; em `free` a taxa cobrada é sempre `0` independente deste valor (ver
   * `OrdersController`), e em `byNeighborhood` quem decide é `deliveryFeeZones`.
   */
  deliveryFeeCents: number;
  welcomeMessage?: string;
  orderConfirmationGreeting?: string;
  /**
   * specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-2 — texto configurável mostrado
   * junto do link público do restaurante (`https://bsdelivery.com.br/r/<slug>`, mesmo formato de
   * `GET /restaurants/me/onboarding`) quando o cliente usa o ícone de compartilhar do app.
   */
  shareMessage?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
  /** specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — reflete o estado da sessão do Baileys
   * (a sessão em si, credenciais/chaves, não fica aqui — ver módulo `whatsapp-connection`). */
  whatsappConnected: boolean;
  /**
   * specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-8 — posição da foto do produto
   * nos itens da lista de cardápio (`ProductListItem`, app cliente): `true` = imagem à direita
   * (comportamento atual, default), `false` = à esquerda. Vale pra toda a listagem do
   * restaurante, não por produto/categoria.
   */
  productImageOnRight: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-1 — liga/desliga a seção "Mais vendidos" no
   * cardápio do cliente. */
  showBestSellers: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-1 — quantos produtos aparecem em "Mais
   * vendidos" quando habilitado. */
  bestSellersCount: number;
  /** specs/0028-destaques-vendidos-banners REQ-4 — liga/desliga a seção "Destaques" no
   * cardápio do cliente (independente de quais produtos estão marcados como destaque). */
  showHighlights: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-10 — liga/desliga o carrossel de banners no
   * cardápio do cliente, independente de haver banners cadastrados (REQ-8 trata da lista
   * vazia, que já esconde o carrossel por conta própria). */
  showBanners: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-5 — banners do carrossel, na ordem de
   * exibição. */
  banners: IRestaurantBanner[];
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2 — liga/desliga o botão "Cancelar
   * pedido" no app cliente (`OrderDetailPage`). Default `true` (mesmo comportamento de antes de
   * existir essa configuração). */
  allowCustomerCancelOrder: boolean;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10 — `'fixed'` (default, preserva
   * comportamento atual, `deliveryFeeCents` usado direto) ou `'byNeighborhood'` (o app calcula
   * via `GET /restaurants/:id/delivery-fee?neighborhood=X`, casando contra `deliveryFeeZones`).
   * `'free'` (specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1) — sem taxa
   * nenhuma, sempre `0` (`OrdersController`), independente do que estiver em `deliveryFeeCents`. */
  deliveryFeeMode: DeliveryFeeMode;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10 — tabela de taxa por bairro, usada só
   * quando `deliveryFeeMode === 'byNeighborhood'`. Casa por texto do bairro (mesmo campo que
   * `ZipCodeResult.neighborhood` já devolve da ViaCEP no app), não por CEP exato/faixa numérica. */
  deliveryFeeZones: IDeliveryFeeZone[];
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-9 — link do Instagram da loja, mostrado
   * no perfil do restaurante e usado como destino de exemplo de banner `externalUrl` no seed.
   * Mesmo padrão opcional de `defaultProductImageUrl`. */
  instagramUrl?: string;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — média (1 casa decimal) e contagem
   * de `IRating`s deste restaurante; recalculados a cada novo rating (`RatingsController`), nunca
   * editados diretamente pelo operador — por isso **fora** de `RestaurantProfileUpdate`. */
  rating: number;
  ratingCount: number;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — `false` (default, comportamento
   * atual) = "Destaques" numa linha só (scroll horizontal); `true` = grade em várias linhas. Só
   * afeta "Destaques" — "Mais vendidos" sempre uma linha, independente disso. */
  showHighlightsInMultipleRows: boolean;
  /** specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — quantos produtos
   * aparecem em "Peça também" no carrinho do app cliente. Diferente de `bestSellersCount`
   * (booleano `showBestSellers` companheiro + default 6), este campo não tem toggle: a seção só
   * aparece quando o operador informa um valor aqui — não informado (`undefined`) desliga a
   * seção inteira (gate no `CartPage` do app, não no BFF: o `CartController` é global e busca as
   * sugestões antes de o restaurante estar resolvido, então a chamada HTTP ainda ocorre — só a
   * renderização/quantidade depende deste campo). */
  cartSuggestionsCount?: number;
  /** specs/0039-onboarding-primeiro-acesso REQ-8/REQ-9 — tipo de negócio escolhido no
   * autocadastro (ex. "pizzaria"), só decide o catálogo inicial na hora da criação; não editável
   * depois pela retaguarda. */
  category?: string;
  /** specs/0039-onboarding-primeiro-acesso REQ-4 — última vez que o operador salvou de verdade a
   * tela de horário de funcionamento (não só o default automático do autocadastro), usado pelo
   * checklist de onboarding pra diferenciar "nunca revisou" de "revisou e manteve o padrão". */
  businessHoursReviewedAt?: Date;
  /** specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — formas de pagamento que
   * este restaurante aceita hoje (reaproveita o mesmo `PaymentMethod` de `Order.paymentMethod`,
   * não um enum próprio) — nasce com as 5 ativas no autocadastro (`RestaurantSignupController`). */
  acceptedPaymentMethods: PaymentMethod[];
  /** specs/0062-confirmar-pedido-whatsapp-restaurante — liga/desliga o botão "WhatsApp" (já
   * existente, `ContactRestaurantActions`) buscando e pré-preenchendo a mensagem do pedido, na
   * tela de detalhe do pedido do app cliente. Desligado = o mesmo botão continua abrindo o chat
   * vazio, comportamento de sempre. */
  notifyRestaurantOnNewOrder: boolean;
  /** specs/0062-confirmar-pedido-whatsapp-restaurante — template da mensagem que o cliente
   * revisa/envia pro WhatsApp do restaurante ao confirmar um pedido. Nasce preenchido no
   * autocadastro (`RestaurantSignupController`) — diferente de `orderConfirmationGreeting`, nunca
   * fica `undefined` num restaurante criado depois desta spec. */
  newOrderRestaurantWhatsAppTemplate?: string;
  /** specs/0063-notificacao-whatsapp-pedido-confirmado — liga/desliga o envio automático de
   * WhatsApp pro cliente quando o restaurante confirma o pedido (`status: 'confirmado'`). */
  notifyCustomerOnOrderConfirmed: boolean;
  /** specs/0063-notificacao-whatsapp-pedido-confirmado — template dessa mensagem; `undefined` usa
   * o texto fixo atual (`DEFAULT_ORDER_CONFIRMED_TEMPLATE`), retrocompatível com todo restaurante
   * já existente antes desta spec. */
  orderConfirmedWhatsAppTemplate?: string;
  /** specs/0064-notificacao-whatsapp-pix-confirmado — liga/desliga o WhatsApp automático pro
   * cliente quando o operador confirma o recebimento do Pix. */
  notifyCustomerOnPixConfirmed: boolean;
  /** specs/0064 — template dessa mensagem; `undefined` usa `DEFAULT_PIX_CONFIRMED_TEMPLATE`. */
  pixConfirmedWhatsAppTemplate?: string;
  /** specs/0069 — liga/desliga o recibo de WhatsApp enviado ao cliente quando ele faz o pedido. */
  notifyCustomerOnOrderCreated: boolean;
  /** specs/0069 — template do recibo; `undefined` usa `DEFAULT_ORDER_RECEIPT_TEMPLATE`. */
  orderReceiptWhatsAppTemplate?: string;
  /** specs/0065 — liga/desliga a mensagem automática de WhatsApp quando o pedido sai pra entrega. */
  notifyCustomerOnOrderOutForDelivery: boolean;
  /** specs/0065 — template; `undefined` usa `DEFAULT_OUT_FOR_DELIVERY_TEMPLATE` (texto de sempre). */
  orderOutForDeliveryWhatsAppTemplate?: string;
  /** specs/0071 — liga/desliga a mensagem automática de WhatsApp quando o pedido entra em preparo. */
  notifyCustomerOnOrderPreparing: boolean;
  /** specs/0071 — template; `undefined` usa `DEFAULT_ORDER_PREPARING_TEMPLATE`. */
  orderPreparingWhatsAppTemplate?: string;
  /** specs/0071 — liga/desliga a mensagem automática de WhatsApp quando o pedido é cancelado. */
  notifyCustomerOnOrderCancelled: boolean;
  /** specs/0071 — template; `undefined` usa `DEFAULT_ORDER_CANCELLED_TEMPLATE`. */
  orderCancelledWhatsAppTemplate?: string;
}

export type DeliveryFeeMode = 'fixed' | 'byNeighborhood' | 'free';

export interface IDeliveryFeeZone {
  /** Gerado no client (`crypto.randomUUID()`) — só serve de `key` pra reordenar/editar/remover
   * na retaguarda, mesmo padrão de `IRestaurantBanner.id`. */
  id: string;
  neighborhood: string;
  feeCents: number;
}

/** specs/0028-destaques-vendidos-banners REQ-6 — destino de um banner ao ser tocado no app;
 * `none` = sem destino configurado, toque não faz nada. */
export type RestaurantBannerLinkType = 'product' | 'category' | 'externalUrl' | 'none';

export interface IRestaurantBanner {
  /** Gerado no client (`crypto.randomUUID()`) — só serve de `key` pra reordenar/editar/remover
   * na retaguarda, não é um id de negócio. */
  id: string;
  imageUrl: string;
  linkType: RestaurantBannerLinkType;
  /** Presente só quando `linkType === 'product'`. */
  productId?: string;
  /** Presente só quando `linkType === 'category'`. */
  menuCategoryId?: string;
  /** Presente só quando `linkType === 'externalUrl'`. */
  externalUrl?: string;
}
