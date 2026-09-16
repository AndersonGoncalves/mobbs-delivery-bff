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
   * `deliveryFeeCents`; sem cálculo por distância). Default 0 — ainda não editável pela
   * retaguarda (specs/0010 não incluiu esse campo no formulário de perfil); fica read-only até
   * uma spec futura expor a edição.
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
   * via `GET /restaurants/:id/delivery-fee?neighborhood=X`, casando contra `deliveryFeeZones`). */
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
}

export type DeliveryFeeMode = 'fixed' | 'byNeighborhood';

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
