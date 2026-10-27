import { OrderType, PaymentMethod } from '../../../orders/domain/entities/order.entity';

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
/** specs/0042 — estado de cobrança do restaurante (subdocumento). */
export interface IRestaurantBilling {
  /** Mês de referência `YYYY-MM` em que os campos abaixo foram calculados. */
  referenceMonth: string;
  currentTier: 'free' | 'pro' | 'premium';
  notified75Percent: boolean;
  notifiedTierUpgrade: boolean;
  /** Marcado manualmente (script `set-billing-status`) até existir gateway de pagamento. */
  status: 'ok' | 'blocked';
  cycle: 'monthly' | 'annual';
}

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
  /** specs/0108 — chave global de reserva/ocultação de itens rastreados; ausência equivale a false. */
  stockControlEnabled?: boolean;
  /** specs/0131-cashback-app REQ-1 — 0 a 100, default 0/ausente (desligado). Único valor fixo,
   * sem agenda por campanha/período (decisão de design, `specs/0131/plan.md`). */
  cashbackPercent?: number;
  /** specs/0132-programa-fidelidade-app REQ-1 — quantos pedidos entregues completam o cartão de
   * fidelidade; ausência/`0` = feature desligada. */
  loyaltyGoalOrders?: number;
  /** specs/0132-programa-fidelidade-app REQ-1 — valor em reais creditado ao saldo resgatável
   * (`specs/0131`) quando `loyaltyGoalOrders` é atingido. */
  loyaltyRewardValue?: number;
  /**
   * specs/0004-carrinho — taxa de entrega fixa nesta v1 (docs/architecture/data-model.md,
   * `deliveryFeeCents`; sem cálculo por distância). Default 0. Editável pela retaguarda (campo
   * "Valor da taxa de entrega", só quando `deliveryFeeMode === 'fixed'`) desde
   * `specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login` REQ-1 — usado direto só
   * nesse modo; em `free` a taxa cobrada é sempre `0` independente deste valor (ver
   * `OrdersController`), e em `byNeighborhood` quem decide é `deliveryFeeZones`.
   */
  deliveryFeeCents: number;
  /**
   * specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-2 — texto configurável mostrado
   * junto do link público do restaurante (`https://bsdelivery.com.br/r/<slug>`, mesmo formato de
   * `GET /restaurants/me/onboarding`) quando o cliente usa o ícone de compartilhar do app.
   * `specs/0072` — nunca vem vazio de um restaurante que não configurou: a leitura
   * (`toEntity`) devolve `buildDefaultShareMessage(name)`; só uma string vazia gravada de
   * propósito faz o app compartilhar apenas o link.
   */
  shareMessage?: string;
  /** specs/0094-mensagem-boas-vindas-home — texto do card de boas-vindas na home do app; vazio = sem card. */
  welcomeMessage?: string;
  /** Pedido explícito do usuário — cor de fundo do card de boas-vindas (`#RRGGBB`, mesmo formato
   * de `primaryColor`). `undefined` = fallback atual (`primaryColor` com opacidade), sem cor
   * própria configurada. */
  welcomeCardColor?: string;
  /** specs/0043-programa-indicacao REQ-1 — código de indicação permanente e único (link `?ref=`). */
  referralCode?: string;
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
  /** toggle visual análogo a `productImageOnRight`: `true` = pages do app cliente usam fundo
   * branco fixo, `false` (default) = tom calculado a partir de `primaryColor`. */
  useWhiteBackground: boolean;
  /** Pedido explícito do usuário — mesmo raciocínio de `useWhiteBackground`, mas pra barra de
   * navegação inferior (`AppBottomNavScaffold`). Default `true` (branco fixo) preserva o
   * comportamento visual que já existia antes deste campo existir — diferente de
   * `useWhiteBackground`, cujo default é o tom calculado. */
  useWhiteBottomNavBar: boolean;
  /** Pedido explícito do usuário (3º follow-up) — a barra de sistema (status bar do app nativo /
   * barra de endereço do navegador no Flutter Web) deixou de ter campo próprio (era
   * `statusBarColorMode`, enum de 3 opções, specs/0167 2º follow-up): sempre segue a mesma cor de
   * `useWhiteBackground` (branca junto com fundo branco, tom calculado junto com fundo colorido),
   * sem opção à parte. Removido daqui — ver `app.dart` (`statusBarColor = theme.
   * scaffoldBackgroundColor`, igual o próprio fundo das pages). */
  /** Pedido explícito do usuário (2º follow-up) — mesmo raciocínio de `useWhiteBackground`, mas
   * pro preenchimento dos campos de texto do app (`AppTextField.fillColor`, `mobbs_ui_kit`):
   * `true` = branco fixo, `false` (default) = `colorScheme.surface` (tom do tema, comportamento
   * que já existia antes deste campo, `specs/0167` T012 — só não era configurável ainda). */
  useWhiteTextFieldColor: boolean;
  /** Pedido explícito do usuário (2º follow-up) — mesmo raciocínio acima, mas pro preenchimento
   * da caixa de busca da home (`AppSearchField.fillColor`): `true` = branco, `false` (default) =
   * cinza claro fixo (`0xFFF3F3F4`, a cor que o campo de busca já usa hoje). */
  useWhiteSearchFieldColor: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-1 — liga/desliga a seção "Mais vendidos" no
   * cardápio do cliente. Desde specs/0117-vitrine-manual-e-ajustes-formularios, os produtos
   * exibidos são curados manualmente (`Product.isBestSeller`) — este campo só decide se a seção
   * aparece, sem conceito de "quantidade" (substituiu `bestSellersCount`, removido). */
  showBestSellers: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-4 — liga/desliga a seção "Destaques" no
   * cardápio do cliente (independente de quais produtos estão marcados como destaque). */
  showHighlights: boolean;
  /** specs/0028-destaques-vendidos-banners REQ-10 — liga/desliga o carrossel de banners no
   * cardápio do cliente, independente de haver banners cadastrados (REQ-8 trata da lista
   * vazia, que já esconde o carrossel por conta própria). */
  showBanners: boolean;
  /** Tag "Peça novamente" no app (cardápio e detalhe do produto). Nasce ligada. */
  showReorderTag: boolean;
  showMostPurchasedTag: boolean;
  /** specs/0042 — cobrança por faixa de faturamento (opcional: restaurante antigo não tem até ser calculado). */
  billing?: IRestaurantBilling;
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
   * Mesmo padrão opcional de `defaultProductImageUrl`. Desde specs/0118-controle-caixa-automatico-
   * redes-sociais REQ-7, mora no quadro "Redes sociais" do Perfil (não mais em "App do cliente"). */
  instagramUrl?: string;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-7/REQ-8 — link do Facebook da loja,
   * mesmo padrão opcional/validação de `instagramUrl`, quadro "Redes sociais" do Perfil. */
  facebookUrl?: string;
  /** Pedido explícito do usuário — tempo médio de atendimento estimado, mostrado no app do
   * cliente (perfil do restaurante); faixa min-max em minutos, uma pra cada modalidade. Defaults
   * (40-60 delivery, 20-40 balcão) aplicados no schema do Mongoose e espelhados aqui como
   * fallback pra documentos antigos sem o campo ainda. */
  deliveryTimeMinMinutes: number;
  deliveryTimeMaxMinutes: number;
  pickupTimeMinMinutes: number;
  pickupTimeMaxMinutes: number;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — média (1 casa decimal) e contagem
   * de `IRating`s deste restaurante; recalculados a cada novo rating (`RatingsController`), nunca
   * editados diretamente pelo operador — por isso **fora** de `RestaurantProfileUpdate`. */
  rating: number;
  ratingCount: number;
  /** specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — `false` (default, comportamento
   * atual) = "Destaques" numa linha só (scroll horizontal); `true` = grade em várias linhas. */
  showHighlightsInMultipleRows: boolean;
  /** Pedido explícito do usuário — mesmo campo que [showHighlightsInMultipleRows], agora pra
   * "Mais pedidos" (antes sempre uma linha só, independente da config de Destaques). */
  showBestSellersInMultipleRows: boolean;
  /** specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — liga/desliga a seção
   * "Peça também" no carrinho do app cliente. Desde specs/0117-vitrine-manual-e-ajustes-formularios,
   * substitui `cartSuggestionsCount` (removido — produtos exibidos são curados manualmente via
   * `Product.isSuggestedInCart`, sem conceito de "quantidade"); mesmo padrão de `showBestSellers`. */
  showCartSuggestions: boolean;
  /** specs/0039-onboarding-primeiro-acesso REQ-8/REQ-9 — tipo de negócio escolhido no
   * autocadastro (ex. "pizzaria"), só decide o catálogo inicial na hora da criação; não editável
   * depois pela retaguarda. */
  category?: string;
  /** specs/0039-onboarding-primeiro-acesso REQ-4 — última vez que o operador salvou de verdade a
   * tela de horário de funcionamento (não só o default automático do autocadastro), usado pelo
   * checklist de onboarding pra diferenciar "nunca revisou" de "revisou e manteve o padrão". */
  businessHoursReviewedAt?: Date;
  /** specs/0185 — itens opcionais do checklist de onboarding que algum operador já abriu (vale para
   * o restaurante inteiro, em qualquer computador). */
  onboardingVisitedItems?: string[];
  /** specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — formas de pagamento que
   * este restaurante aceita hoje (reaproveita o mesmo `PaymentMethod` de `Order.paymentMethod`,
   * não um enum próprio) — nasce com as 5 ativas no autocadastro (`RestaurantSignupController`). */
  acceptedPaymentMethods: PaymentMethod[];
  /** specs/0151-confirmacao-automatica-por-forma-pagamento REQ-1 — formas de pagamento (dentro de
   * `acceptedPaymentMethods`) cujo pedido deve confirmar sozinho, sem o operador tocar no botão
   * "Confirmar". Pix é tratado como caso particular na camada de aplicação: confirma só depois do
   * pagamento aprovado (`PATCH .../payment/confirm`), nunca na criação do pedido. Default: vazio
   * (nenhuma forma confirma sozinha — preserva o comportamento de hoje pra quem não configurar). */
  autoConfirmPaymentMethods?: PaymentMethod[];
  /** specs/0083-modalidade-entrega-retirada-restaurante REQ-1 — modalidades que este restaurante
   * aceita (`delivery`/`pickup`, pelo menos uma). Default: ambas (documento antigo = "ambos"). */
  orderTypes: OrderType[];
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
  /** Retirada: liga/desliga a mensagem avisando que o pedido já pode ser retirado (no lugar de "saiu para entrega"). */
  notifyCustomerOnOrderReadyForPickup: boolean;
  /** specs/0065 — template; `undefined` usa `DEFAULT_OUT_FOR_DELIVERY_TEMPLATE` (texto de sempre). */
  orderOutForDeliveryWhatsAppTemplate?: string;
  orderReadyForPickupWhatsAppTemplate?: string;
  /** specs/0071 — liga/desliga a mensagem automática de WhatsApp quando o pedido entra em preparo. */
  notifyCustomerOnOrderPreparing: boolean;
  /** specs/0071 — template; `undefined` usa `DEFAULT_ORDER_PREPARING_TEMPLATE`. */
  orderPreparingWhatsAppTemplate?: string;
  /** specs/0071 — liga/desliga a mensagem automática de WhatsApp quando o pedido é cancelado. */
  notifyCustomerOnOrderCancelled: boolean;
  /** specs/0071 — template; `undefined` usa `DEFAULT_ORDER_CANCELLED_TEMPLATE`. */
  orderCancelledWhatsAppTemplate?: string;
  /** specs/0086-mensagens-whatsapp-pedido-entregue-pagamento-confirmado — liga/desliga a mensagem
   * automática de WhatsApp quando o pedido é entregue (`status: 'entregue'`); antes desta spec
   * essa mensagem sempre saía com texto fixo, sem toggle nenhum. */
  notifyCustomerOnOrderDelivered: boolean;
  /** specs/0086 — template; `undefined` usa `DEFAULT_ORDER_DELIVERED_TEMPLATE`. */
  orderDeliveredWhatsAppTemplate?: string;
  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-1/REQ-2 — `'manual'` (default,
   * comportamento atual: dono abre/fecha pela tela "Controle de caixa") ou `'automatic'`
   * (abertura/fechamento seguem o `businessHours` do dia, sem horário próprio — REQ-2). Seletor
   * mora em `CashRegisterPage.tsx` (decisão do spec), não no Perfil. */
  cashRegisterMode: CashRegisterMode;
  /** Pedido explícito do usuário — liga/desliga global do bloqueio de clientes por telefone
   * (`BlockedCustomer`, módulo `customer-blocking`); desligado (default) não bloqueia ninguém
   * mesmo com números cadastrados na lista — a lista e o liga/desliga são independentes. */
  customerBlockingEnabled: boolean;
  /** specs/0139-impressao-automatica-bridge REQ-5/REQ-6 — configuração do bridge local
   * (`mobbs-delivery-print`): liga/desliga, intervalo de consulta (segundos, 5-120, default 10) e
   * a chave de API que o bridge usa pra se autenticar (gerada sob demanda, nunca em branco depois
   * da primeira geração — ver `AutoPrintController`). */
  autoPrintEnabled: boolean;
  autoPrintIntervalSeconds: number;
  autoPrintApiKey?: string;
  /** specs/0156-filtro-idade-impressao-automatica REQ-1/REQ-2 — pedido mais velho que isso (desde
   * `Order.createdAt`) deixa de ser candidato à fila de impressão automática, mesmo nunca tendo
   * sido impresso — evita despejar uma pilha de pedidos represados quando o bridge volta a ficar
   * online depois de ficar fora do ar. Default 5 minutos quando não configurado. */
  autoPrintMaxAgeMinutes?: number;
  /** specs/0140-confirmacao-automatica-pix REQ-1b — chave de API por restaurante pra um
   * futuro webhook de gateway/PSP (`specs/0101`/`specs/0170`) avisar que um Pix foi confirmado,
   * sem token Firebase nem operador logado (mesmo raciocínio de `autoPrintApiKey`, gerada sob
   * demanda, nunca em branco depois da primeira geração — ver `PaymentWebhookController`). */
  paymentWebhookApiKey?: string;
  /** specs/0101-integracao-asaas (fase 1, só Pix) — subconta Asaas do restaurante (modelo de
   * conta decidido: cada restaurante tem a própria subconta, dinheiro cai direto pra ele, taxa
   * do Asaas é dele). `asaasApiKey` é a chave da PRÓPRIA subconta (devolvida uma única vez na
   * criação, `AsaasOnboardingController`) — nunca a mesma chave da conta mãe
   * (`environment.asaas.apiKey`), e nunca exposta numa resposta de API pro operador (mesmo
   * cuidado de `autoPrintApiKey`/`paymentWebhookApiKey`). `asaasWebhookToken` valida o header
   * `asaas-access-token` que o Asaas envia no webhook (`AsaasWebhookController`). */
  onlinePaymentsEnabled?: boolean;
  asaasAccountId?: string;
  asaasWalletId?: string;
  asaasApiKey?: string;
  asaasWebhookToken?: string;
  /** Pedido explícito do usuário (follow-up) — dados comerciais submetidos na criação da
   * subconta, guardados (sem segredo nenhum aqui, é a mesma coisa que o operador digitou no
   * formulário) pra a retaguarda conseguir reexibir os campos preenchidos/desabilitados depois
   * de vinculado, em vez de perder tudo a cada reload. */
  asaasSubaccountData?: {
    name: string;
    email: string;
    cpfCnpj: string;
    birthDate: string;
    mobilePhone: string;
    incomeValue: number;
    address: string;
    addressNumber: string;
    province: string;
    postalCode: string;
  };
  /** specs/0101-integracao-asaas (fase 2) — o webhook de Pix (`createSubaccount`, acima) nunca é
   * tocado; cartão via Asaas Checkout precisa de um webhook ADICIONAL (eventos `CHECKOUT_*`,
   * registrado sob demanda — `AsaasClient.createCheckoutWebhook`) na primeira vez que o
   * restaurante recebe um pedido pago assim, pra nunca reconfigurar o que já está em produção.
   * Marcado depois do registro bem-sucedido, pra não repetir a cada pedido. */
  asaasCheckoutWebhookRegistered?: boolean;
  /** specs/0170-integracao-mercado-pago — vínculo OAuth da conta Mercado Pago do restaurante
   * (modelo diferente do Asaas: não é subconta/KYC criada por nós, é a própria conta do
   * restaurante autorizando nossa aplicação). `mercadoPagoAccessToken`/`mercadoPagoRefreshToken`
   * nunca devem aparecer numa resposta de API (nem pro operador — ver `toOperatorRestaurant`),
   * só `mercadoPagoUserId`/`mercadoPagoTokenExpiresAt`, que não são segredo. */
  mercadoPagoAccessToken?: string;
  mercadoPagoRefreshToken?: string;
  mercadoPagoUserId?: string;
  mercadoPagoTokenExpiresAt?: string;
}

export type CashRegisterMode = 'manual' | 'automatic';

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
export type RestaurantBannerLinkType = 'product' | 'category' | 'externalUrl' | 'highlights' | 'bestSellers' | 'none';

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
