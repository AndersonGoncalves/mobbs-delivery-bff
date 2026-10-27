import { IRestaurant } from '../domain/entities/restaurant.entity';

/**
 * Achado real (pedido explícito do usuário, auditoria de segurança nesta sessão) — os handlers
 * deste módulo devolviam `IRestaurant` cru (`res.json(200, restaurant)`), inclusive na rota
 * PÚBLICA `/restaurants/resolve/:slug` (sem nenhuma autenticação): qualquer um que soubesse o
 * slug de um restaurante conseguia ler `autoPrintApiKey`/`paymentWebhookApiKey`/`asaasApiKey` no
 * JSON da resposta. `BaseRouter.render()` só checa null, não filtra campos — nunca foi pensado
 * como serializador.
 *
 * Allowlist (não denylist) de propósito pra `toPublicRestaurant` — segurança por padrão: um
 * campo secreto novo adicionado depois (ex. `mercadoPagoAccessToken` desta mesma sessão) fica de
 * fora automaticamente, sem precisar lembrar de negá-lo explicitamente. Lista conferida contra
 * `RestaurantResponseDTO.fromMap` (`mobbs-delivery-app/src/shared/api`) — são exatamente os
 * campos que o app do cliente já lê hoje, nem um a mais (exceto `mercadoPagoLinked`, campo NOVO
 * desta sessão, specs/0170-integracao-mercado-pago REQ-3 — o app precisa saber se mostra ou não
 * "Cartão de crédito (cobrar agora)" no checkout, mas `mercadoPagoAccessToken` em si é secreto;
 * por isso aqui é só o booleano calculado, nunca o token).
 */
export function toPublicRestaurant(restaurant: IRestaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    isActive: restaurant.isActive,
    businessHours: restaurant.businessHours,
    logoUrl: restaurant.logoUrl,
    primaryColor: restaurant.primaryColor,
    onPrimaryColor: restaurant.onPrimaryColor,
    defaultProductImageUrl: restaurant.defaultProductImageUrl,
    address: restaurant.address,
    phone: restaurant.phone,
    document: restaurant.document,
    minimumOrderValue: restaurant.minimumOrderValue,
    deliveryFeeCents: restaurant.deliveryFeeCents,
    deliveryFeeMode: restaurant.deliveryFeeMode,
    shareMessage: restaurant.shareMessage,
    welcomeMessage: restaurant.welcomeMessage,
    welcomeCardColor: restaurant.welcomeCardColor,
    pixKey: restaurant.pixKey,
    productImageOnRight: restaurant.productImageOnRight,
    useWhiteBackground: restaurant.useWhiteBackground,
    useWhiteBottomNavBar: restaurant.useWhiteBottomNavBar,
    useWhiteTextFieldColor: restaurant.useWhiteTextFieldColor,
    useWhiteSearchFieldColor: restaurant.useWhiteSearchFieldColor,
    // Achado real (pedido explícito do usuário) — o comentário acima já dizia que este campo
    // devia estar aqui (`specs/0170-integracao-mercado-pago` REQ-3), mas nunca foi de fato
    // adicionado ao `return`: `checkout_page.dart` sempre recebia a chave ausente, caía no
    // default `false` do DTO, e "Cartão de Crédito Online" nunca aparecia no checkout pro
    // cliente, mesmo com o Mercado Pago vinculado de verdade.
    mercadoPagoLinked: Boolean(restaurant.mercadoPagoAccessToken),
    showBestSellers: restaurant.showBestSellers,
    showHighlights: restaurant.showHighlights,
    showBanners: restaurant.showBanners,
    showReorderTag: restaurant.showReorderTag,
    showMostPurchasedTag: restaurant.showMostPurchasedTag,
    banners: restaurant.banners,
    allowCustomerCancelOrder: restaurant.allowCustomerCancelOrder,
    instagramUrl: restaurant.instagramUrl,
    deliveryTimeMinMinutes: restaurant.deliveryTimeMinMinutes,
    deliveryTimeMaxMinutes: restaurant.deliveryTimeMaxMinutes,
    pickupTimeMinMinutes: restaurant.pickupTimeMinMinutes,
    pickupTimeMaxMinutes: restaurant.pickupTimeMaxMinutes,
    rating: restaurant.rating,
    ratingCount: restaurant.ratingCount,
    showHighlightsInMultipleRows: restaurant.showHighlightsInMultipleRows,
    showBestSellersInMultipleRows: restaurant.showBestSellersInMultipleRows,
    showCartSuggestions: restaurant.showCartSuggestions,
    acceptedPaymentMethods: restaurant.acceptedPaymentMethods,
    orderTypes: restaurant.orderTypes,
    notifyRestaurantOnNewOrder: restaurant.notifyRestaurantOnNewOrder,
  };
}

/**
 * Pra rotas autenticadas de operador (`/restaurants/me/...`) — a retaguarda precisa de bem mais
 * campos que o app público (templates de WhatsApp, configurações administrativas etc.), por isso
 * aqui é denylist, não allowlist: só exclui o que é genuinamente segredo. `autoPrintApiKey` FICA
 * (a UI mostra/copia de propósito, `AutoPrintSettingsPage.tsx`) — os outros nunca têm uma tela
 * que precise exibir o valor bruto, só confirmar "vinculado"/"ativo" (`asaasAccountId`,
 * `onlinePaymentsEnabled`, `mercadoPagoUserId` continuam, não são segredo).
 */
export function toOperatorRestaurant(restaurant: IRestaurant): Omit<IRestaurant, 'paymentWebhookApiKey' | 'asaasApiKey' | 'asaasWebhookToken' | 'mercadoPagoAccessToken' | 'mercadoPagoRefreshToken'> {
  const safe: Partial<IRestaurant> = { ...restaurant };
  delete safe.paymentWebhookApiKey;
  delete safe.asaasApiKey;
  delete safe.asaasWebhookToken;
  delete safe.mercadoPagoAccessToken;
  delete safe.mercadoPagoRefreshToken;
  // Pedido explícito do usuário (follow-up) — `previousAsaasSubaccounts` carrega `asaasApiKey`/
  // `asaasWebhookToken` por entrada (a UI só precisa listar pra oferecer "Reconectar", nunca ver
  // a chave); mesmo cuidado do campo ativo acima, mas por item do array.
  if (safe.previousAsaasSubaccounts) {
    safe.previousAsaasSubaccounts = safe.previousAsaasSubaccounts.map((entry) => {
      const redacted = { ...entry };
      delete (redacted as Partial<typeof entry>).asaasApiKey;
      delete (redacted as Partial<typeof entry>).asaasWebhookToken;
      return redacted;
    });
  }
  return safe as Omit<IRestaurant, 'paymentWebhookApiKey' | 'asaasApiKey' | 'asaasWebhookToken' | 'mercadoPagoAccessToken' | 'mercadoPagoRefreshToken'>;
}
