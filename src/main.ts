import { Server } from './shared/http/server';
import { SupportController } from './modules/support/presentation/support.controller';
import { SupportSettingsMongooseRepository } from './modules/support/infra/support-settings.mongoose.repository';
import { LandingContentController } from './modules/landing-content/presentation/landing-content.controller';
import {
  LandingContentMongooseRepository,
  LandingTestimonialMongooseRepository,
} from './modules/landing-content/infra/landing-content.mongoose.repository';
import { SuggestionRepository } from './modules/suggestions/infra/suggestion.repository';
import { SuggestionsController } from './modules/suggestions/presentation/suggestions.controller';
import { buildRestaurantOperatorMiddleware } from './shared/http/restaurant-operator.middleware';
import { RestaurantMongooseRepository } from './modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantsController } from './modules/restaurants/presentation/restaurants.controller';
import { RestaurantSignupController } from './modules/restaurants/presentation/restaurant-signup.controller';
import { OnboardingChecklistController } from './modules/restaurants/presentation/onboarding-checklist.controller';
import { RestaurantOperatorMongooseRepository } from './modules/restaurant-operators/infra/repositories/restaurant-operator.mongoose.repository';
import { migrateOperatorRolesToDono } from './modules/restaurant-operators/infra/migrations/migrate-operator-roles-to-dono';
import { deactivateDuplicateActiveOperators } from './modules/restaurant-operators/infra/migrations/deactivate-duplicate-active-operators';
import { backfillManualBestSellers } from './modules/catalog/infra/migrations/backfill-manual-best-sellers';
import { backfillStockTracking } from './modules/catalog/infra/migrations/backfill-stock-tracking';
import { ReferralMongooseRepository } from './modules/referrals/infra/repositories/referral.mongoose.repository';
import { ReferralCodeMongooseRepository } from './modules/referrals/infra/repositories/referral-code.mongoose.repository';
import { CustomerPixKeyMongooseRepository } from './modules/referrals/infra/repositories/customer-pix-key.mongoose.repository';
import { CustomerReferralsController } from './modules/referrals/presentation/customer-referrals.controller';
import { PlatformReferralsController } from './modules/referrals/presentation/platform-referrals.controller';
import { ResellerMongooseRepository } from './modules/resellers/infra/repositories/reseller.mongoose.repository';
import { ResellerProspectMongooseRepository } from './modules/resellers/infra/repositories/reseller-prospect.mongoose.repository';
import { ResellerClientMongooseRepository } from './modules/resellers/infra/repositories/reseller-client.mongoose.repository';
import { ResellerController } from './modules/resellers/presentation/reseller.controller';
import { PlatformResellersController } from './modules/resellers/presentation/platform-resellers.controller';
import { buildResellerMiddleware } from './shared/http/reseller.middleware';
import { RestaurantOperatorsController } from './modules/restaurant-operators/presentation/restaurant-operators.controller';
import { MenuCategoryMongooseRepository } from './modules/catalog/infra/repositories/menu-category.mongoose.repository';
import { ProductMongooseRepository } from './modules/catalog/infra/repositories/product.mongoose.repository';
import { S3ProductImageStorage } from './modules/catalog/infra/storage/s3-product-image-storage';
import { CatalogController } from './modules/catalog/presentation/catalog.controller';
import { environment } from './shared/config/environment';
import { s3Client } from './shared/storage/s3-client';
import { OrderMongooseRepository } from './modules/orders/infra/repositories/order.mongoose.repository';
import { StockReservationService } from './modules/orders/domain/services/stock-reservation.service';
import { PaymentMongooseRepository } from './modules/orders/infra/repositories/payment.mongoose.repository';
import { OrdersController } from './modules/orders/presentation/orders.controller';
import { PaymentWebhookController } from './modules/orders/presentation/payment-webhook.controller';
import { AsaasOnboardingController } from './modules/payments-asaas/presentation/asaas-onboarding.controller';
import { AsaasWebhookController } from './modules/payments-asaas/presentation/asaas-webhook.controller';
import { MercadoPagoOAuthController } from './modules/payments-mercadopago/presentation/mercado-pago-oauth.controller';
import { MercadoPagoWebhookController } from './modules/payments-mercadopago/presentation/mercado-pago-webhook.controller';
import { InstagramAutomationController } from './modules/instagram-automation/presentation/instagram-automation.controller';
import { InstagramPostMongooseRepository } from './modules/instagram-automation/infra/repositories/instagram-post.mongoose.repository';
import { FacebookGraphClient } from './modules/instagram-automation/infra/facebook-graph-client';
import { PublishDueInstagramPostsService } from './modules/instagram-automation/domain/publish-due-instagram-posts';
import { CouponMongooseRepository } from './modules/coupons/infra/repositories/coupon.mongoose.repository';
import { CouponsController } from './modules/coupons/presentation/coupons.controller';
import { PromotionMongooseRepository } from './modules/promotions/infra/repositories/promotion.mongoose.repository';
import { PromotionsController } from './modules/promotions/presentation/promotions.controller';
import { RawMaterialMongooseRepository } from './modules/raw-materials/infra/repositories/raw-material.mongoose.repository';
import { StockMovementMongooseRepository } from './modules/raw-materials/infra/repositories/stock-movement.mongoose.repository';
import { RawMaterialsController } from './modules/raw-materials/presentation/raw-materials.controller';
import { SupplierMongooseRepository } from './modules/suppliers/infra/repositories/supplier.mongoose.repository';
import { SuppliersController } from './modules/suppliers/presentation/suppliers.controller';
import { MotoboyMongooseRepository } from './modules/motoboys/infra/repositories/motoboy.mongoose.repository';
import { MotoboysController } from './modules/motoboys/presentation/motoboys.controller';
import { TableServiceController } from './modules/table-service/presentation/table-service.controller';
import { RestaurantTableMongooseRepository } from './modules/table-service/infra/repositories/restaurant-table.mongoose.repository';
import { TableWaiterMongooseRepository } from './modules/table-service/infra/repositories/table-waiter.mongoose.repository';
import { TableMapLayoutMongooseRepository } from './modules/table-service/infra/repositories/table-map-layout.mongoose.repository';
import { PurchaseOrderMongooseRepository } from './modules/purchase-orders/infra/repositories/purchase-order.mongoose.repository';
import { ReceivePurchaseOrderService } from './modules/purchase-orders/infra/services/receive-purchase-order.service';
import { PurchaseOrdersController } from './modules/purchase-orders/presentation/purchase-orders.controller';
import { AccountPayableMongooseRepository } from './modules/financeiro/infra/repositories/account-payable.mongoose.repository';
import { AccountReceivableMongooseRepository } from './modules/financeiro/infra/repositories/account-receivable.mongoose.repository';
import { CashRegisterMongooseRepository } from './modules/financeiro/infra/repositories/cash-register.mongoose.repository';
import { CashRegisterService } from './modules/financeiro/infra/services/cash-register.service';
import { AccountsPayableController } from './modules/financeiro/presentation/accounts-payable.controller';
import { AccountsReceivableController } from './modules/financeiro/presentation/accounts-receivable.controller';
import { CashRegisterController } from './modules/financeiro/presentation/cash-register.controller';
import { AddressMongooseRepository } from './modules/customers/infra/repositories/address.mongoose.repository';
import { CustomerMongooseRepository } from './modules/customers/infra/repositories/customer.mongoose.repository';
import { BlockedCustomerMongooseRepository } from './modules/customer-blocking/infra/repositories/blocked-customer.mongoose.repository';
import { CustomerBlockingController } from './modules/customer-blocking/presentation/customer-blocking.controller';
import { AutoPrintController } from './modules/auto-print/presentation/auto-print.controller';
import { buildPrintApiKeyMiddleware } from './shared/http/print-api-key.middleware';
import { TotemController } from './modules/totem/presentation/totem.controller';
import { OperatorDraftsController } from './modules/operator-drafts/presentation/operator-drafts.controller';
import { OperatorDraftMongooseRepository } from './modules/operator-drafts/infra/repositories/operator-draft.mongoose.repository';
import { buildTotemApiKeyMiddleware } from './shared/http/totem-api-key.middleware';
import { buildPaymentWebhookApiKeyMiddleware } from './shared/http/payment-webhook-api-key.middleware';
import { FavoriteMongooseRepository } from './modules/customers/infra/repositories/favorite.mongoose.repository';
import { CustomersController } from './modules/customers/presentation/customers.controller';
import { CustomerSummaryMongooseRepository } from './modules/customers-admin/infra/repositories/customer-summary.mongoose.repository';
import { CustomersSummaryController } from './modules/customers-admin/presentation/customers-summary.controller';
import { CustomerBalanceService } from './modules/customer-balance/domain/services/customer-balance.service';
import { CustomerBalanceMongooseRepository } from './modules/customer-balance/infra/repositories/customer-balance.mongoose.repository';
import { CustomerBalanceController } from './modules/customer-balance/presentation/customer-balance.controller';
import { CustomerPaymentMethodsController } from './modules/customers-admin/presentation/customer-payment-methods.controller';
import { WhatsAppNotificationService } from './modules/notifications/infra/whatsapp-notification.service';
import { AdditionalGroupTemplateMongooseRepository } from './modules/additional-group-templates/infra/repositories/additional-group-template.mongoose.repository';
import { AdditionalGroupTemplatesController } from './modules/additional-group-templates/presentation/additional-group-templates.controller';
import { WhatsAppConnectionService } from './modules/whatsapp-connection/infra/whatsapp-connection.service';
import { WhatsAppConnectionController } from './modules/whatsapp-connection/presentation/whatsapp-connection.controller';
import { NodemailerEmailService } from './shared/email/nodemailer-email.service';
import { RatingMongooseRepository } from './modules/ratings/infra/repositories/rating.mongoose.repository';
import { RatingsController } from './modules/ratings/presentation/ratings.controller';
import { PresenceMongooseRepository } from './modules/presence/infra/repositories/presence.mongoose.repository';
import { PresenceController } from './modules/presence/presentation/presence.controller';
import { UploadsController } from './modules/uploads/presentation/uploads.controller';
import { CampaignMongooseRepository } from './modules/campaigns/infra/repositories/campaign.mongoose.repository';
import { CampaignOptOutMongooseRepository } from './modules/campaigns/infra/repositories/campaign-opt-out.mongoose.repository';
import { CampaignDispatchService } from './modules/campaigns/infra/services/campaign-dispatch.service';
import { CampaignsController } from './modules/campaigns/presentation/campaigns.controller';
import { RecomputeRestaurantBillingUseCase } from './modules/billing/domain/recompute-restaurant-billing.use-case';
import { BillingNotifier } from './modules/billing/infra/billing-notifier.service';
import { BillingSettingsMongooseRepository } from './modules/billing/infra/repositories/billing-settings.mongoose.repository';
import { BillingController } from './modules/billing/presentation/billing.controller';
import { BillingSettingsController } from './modules/billing/presentation/billing-settings.controller';
import { PlatformController } from './modules/platform/presentation/platform.controller';
import { buildPlatformAdminMiddleware, parsePlatformAdminEmails } from './shared/http/platform-admin.middleware';
import { ProspectsController } from './modules/prospects/presentation/prospects.controller';
import { ProspectMongooseRepository } from './modules/prospects/infra/repositories/prospect.mongoose.repository';
import { GooglePlacesService } from './modules/prospects/infra/services/google-places.service';
import { ProspectOutreachService } from './modules/prospects/infra/services/prospect-outreach.service';
import { PlatformWhatsAppConnectionService } from './modules/whatsapp-connection/infra/platform-whatsapp-connection.service';
import { PlatformWhatsAppConnectionController } from './modules/whatsapp-connection/presentation/platform-whatsapp-connection.controller';
import { AsaasClient } from './modules/payments-asaas/infra/asaas-client';
// specs/0175-cobranca-assinatura-asaas.
import { BillingPayerMongooseRepository } from './modules/platform-billing/infra/repositories/billing-payer.mongoose.repository';
import { BillingSettingsVersionMongooseRepository } from './modules/platform-billing/infra/repositories/billing-settings-version.mongoose.repository';
import { SubscriptionObligationMongooseRepository } from './modules/platform-billing/infra/repositories/subscription-obligation.mongoose.repository';
import { SubscriptionEventMongooseRepository } from './modules/platform-billing/infra/repositories/subscription-event.mongoose.repository';
import { AnnualSubscriptionMongooseRepository } from './modules/platform-billing/infra/repositories/annual-subscription.mongoose.repository';
import { PixAvailabilityExceptionMongooseRepository } from './modules/platform-billing/infra/repositories/pix-availability-exception.mongoose.repository';
import { PlatformBillingActivationMongooseRepository } from './modules/platform-billing/infra/repositories/platform-billing-activation.mongoose.repository';
import { activatePlatformBilling } from './modules/platform-billing/infra/migrations/activate-platform-billing';
import { CloseMonthlyBillingService } from './modules/platform-billing/domain/services/close-monthly-billing.service';
import { AnnualSubscriptionService } from './modules/platform-billing/domain/services/annual-subscription.service';
import { ObligationIssuanceService } from './modules/platform-billing/domain/services/obligation-issuance.service';
import { ReconciliationService } from './modules/platform-billing/domain/services/reconciliation.service';
import { BillingPayerService } from './modules/platform-billing/domain/services/billing-payer.service';
import { PlatformBillingCycleService } from './modules/platform-billing/domain/services/platform-billing-cycle.service';
import { PlatformBillingController } from './modules/platform-billing/presentation/platform-billing.controller';
import { PlatformBillingWebhookController } from './modules/platform-billing/presentation/platform-billing-webhook.controller';

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantRepository = new RestaurantMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository, restaurantRepository);
// specs/0189-painel-revenda — instâncias únicas, compartilhadas por `RestaurantSignupController`
// (vínculo automático via `?revenda=`), `ResellerController` e `PlatformResellersController`.
const resellerRepository = new ResellerMongooseRepository();
const resellerProspectRepository = new ResellerProspectMongooseRepository();
const resellerClientRepository = new ResellerClientMongooseRepository();
const resellerMiddleware = buildResellerMiddleware(resellerRepository);
// specs/0044-promocoes-produtos — instância única, compartilhada por ProductMongooseRepository
// (preço/percentual promocional + desconto em opção vinculada) e MenuCategoryMongooseRepository
// (versão leve do cardápio por categoria), além do PromotionsController (CRUD da retaguarda).
const promotionRepository = new PromotionMongooseRepository();
const productRepository = new ProductMongooseRepository(promotionRepository);
const customerRepository = new CustomerMongooseRepository();
const blockedCustomerRepository = new BlockedCustomerMongooseRepository();
// specs/0112 — chave Pix do cliente, compartilhada entre o cliente, o painel e a exclusão de conta.
const customerPixKeyRepository = new CustomerPixKeyMongooseRepository();

// specs/0013-notificacoes-whatsapp — uma única instância de `WhatsAppConnectionService`
// compartilhada entre `OrdersController` (envia mensagens) e `WhatsAppConnectionController`
// (pareamento/status), já que ela guarda os sockets ativos em memória por restaurante.
const whatsAppConnectionService = new WhatsAppConnectionService(restaurantRepository);
const whatsAppNotificationService = new WhatsAppNotificationService(
  whatsAppConnectionService,
  customerRepository,
  restaurantRepository,
);

// specs/0014-financeiro — uma única instância de repositório de caixa compartilhada entre
// `CashRegisterController` (rotas de caixa da retaguarda) e `CashRegisterService` (lançamento
// automático chamado por `OrdersController` ao marcar um pedido Pix como entregue).
// specs/0118-controle-caixa-automatico-redes-sociais — `CashRegisterService` ganhou
// `ensureAutomaticSchedule`/`getClosingSummary`, por isso agora também recebe `restaurantRepository`
// (ler `cashRegisterMode`/`businessHours`) e `orderRepository` (somar vendas por forma de
// pagamento) — a instância só é montada depois de `orderRepository` existir, por isso o bloco
// desceu pra depois dele (ver abaixo).
const cashRegisterRepository = new CashRegisterMongooseRepository();

// specs/0015-estoque-compras — `RawMaterialMongooseRepository`/`StockMovementMongooseRepository`
// compartilhados entre `RawMaterialsController` (ajuste manual/histórico, REQ-5/REQ-6) e
// `ReceivePurchaseOrderService` (recebimento de compra, REQ-3), sem duplicar instância.
const rawMaterialRepository = new RawMaterialMongooseRepository();
const stockMovementRepository = new StockMovementMongooseRepository();
const purchaseOrderRepository = new PurchaseOrderMongooseRepository();
const receivePurchaseOrderService = new ReceivePurchaseOrderService(
  purchaseOrderRepository,
  rawMaterialRepository,
  stockMovementRepository,
  productRepository,
);

// specs/0016-clientes-retaguarda — mesma instância de `OrderMongooseRepository` compartilhada
// entre `OrdersController` e `CustomersSummaryController` (REQ-3, histórico de pedidos do
// cliente escopado ao restaurante), sem duplicar instância.
const orderRepository = new OrderMongooseRepository();

// specs/0118-controle-caixa-automatico-redes-sociais — ver comentário acima de
// `cashRegisterRepository`: só pode ser montado aqui, depois de `orderRepository` existir.
const cashRegisterService = new CashRegisterService(cashRegisterRepository, restaurantRepository, orderRepository);

// specs/0131-cashback-app + specs/0132-programa-fidelidade-app — mesma instância compartilhada
// entre `OrdersController` (resgate/devolução/crédito), `CustomerBalanceController` (leitura do
// cliente) e `CustomersSummaryController` (leitura da retaguarda), sem duplicar instância.
const customerBalanceService = new CustomerBalanceService(new CustomerBalanceMongooseRepository());

// specs/0113-parametrizacao-faixas-cobranca — documento único de limites/mensalidades, compartilhado
// entre o recálculo por pedido entregue, o card de faturamento do restaurante, o painel da
// plataforma e a rota pública consumida pela landing.
const billingSettingsRepository = new BillingSettingsMongooseRepository();

// specs/0020-pix-no-app — primeiro consumidor real de `Payment` (coleção já existia, sem
// repository próprio até aqui); mesma instância usada pra ler status e confirmar recebimento.
const paymentRepository = new PaymentMongooseRepository();

// specs/0023-portabilidade-dados — primeira capacidade de envio de e-mail do BFF; sem
// `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` configurados, `send()` falha em runtime, mas o
// fluxo de exportação (`CustomersController`) trata isso como fire-and-forget (REQ-5), nunca
// trava o cliente.
const emailService = new NodemailerEmailService();

// specs/0022-cupons-desconto — mesma instância compartilhada entre `CouponsController` (gestão
// na retaguarda + validação de UX pelo cliente) e `OrdersController` (revalidação server-side +
// `incrementUsageIfWithinLimit` na criação do pedido, REQ-4), sem duplicar instância.
const couponRepository = new CouponMongooseRepository();

// specs/0092-campanha-whatsapp-clientes — `CampaignDispatchService` roda fora do ciclo
// request/response (fire-and-forget, chamado por `CampaignsController.POST .../campaigns`), por
// isso é montado aqui fora, com as mesmas instâncias compartilhadas de `restaurantRepository`/
// `whatsAppConnectionService` do resto do BFF.
const campaignRepository = new CampaignMongooseRepository();
const campaignOptOutRepository = new CampaignOptOutMongooseRepository();
const campaignDispatchService = new CampaignDispatchService(
  campaignRepository,
  new CustomerSummaryMongooseRepository(),
  campaignOptOutRepository,
  restaurantRepository,
  whatsAppConnectionService,
);

// specs/0124-campanha-whatsapp-prospects — sessão de WhatsApp independente da plataforma (não
// vinculada a nenhum restaurante), reaberta no boot só se já tiver sido pareada antes. Mesma
// instância de `ProspectMongooseRepository` compartilhada entre `ProspectsController` (busca/
// salvar/listar) e `ProspectOutreachService` (envio), sem duplicar.
const prospectRepository = new ProspectMongooseRepository();
const platformWhatsAppConnectionService = new PlatformWhatsAppConnectionService();
const prospectOutreachService = new ProspectOutreachService(prospectRepository, platformWhatsAppConnectionService);

// specs/0175-cobranca-assinatura-asaas — cobrança da assinatura da plataforma (lojista paga a
// plataforma), separada de `payments-asaas`/`payments-mercadopago` (pagamento de PEDIDO).
// `restaurantOperatorMiddlewareWithoutBillingGuard` (sem `restaurantRepository`, ao contrário de
// `restaurantOperatorMiddleware` acima) nunca lança `BillingBlockedError` — REQ-26 exige que o
// lojista BLOQUEADO continue acessando a própria página de regularização.
const restaurantOperatorMiddlewareWithoutBillingGuard = buildRestaurantOperatorMiddleware(restaurantOperatorRepository);
const billingPayerRepository = new BillingPayerMongooseRepository();
const billingSettingsVersionRepository = new BillingSettingsVersionMongooseRepository();
const obligationRepository = new SubscriptionObligationMongooseRepository();
const subscriptionEventRepository = new SubscriptionEventMongooseRepository();
const annualSubscriptionRepository = new AnnualSubscriptionMongooseRepository();
const pixAvailabilityExceptionRepository = new PixAvailabilityExceptionMongooseRepository();
const platformBillingActivationRepository = new PlatformBillingActivationMongooseRepository();
// Mesma credencial da conta MÃE já usada em `AsaasOnboardingController` pra criar subcontas
// (specs/0101) — aqui é um USO NOVO da mesma conta (cliente/cobrança própria), nunca uma
// subconta de restaurante.
const platformAsaasClient = new AsaasClient(environment.asaas.apiKey ?? '', environment.asaas.baseUrl);
const closeMonthlyBillingService = new CloseMonthlyBillingService({
  orderRepository,
  obligationRepository,
  settingsVersionRepository: billingSettingsVersionRepository,
});
const annualSubscriptionService = new AnnualSubscriptionService({
  annualSubscriptionRepository,
  obligationRepository,
  closeMonthlyBillingService,
});
const obligationIssuanceService = new ObligationIssuanceService({
  obligationRepository,
  billingPayerRepository,
  pixAvailabilityExceptionRepository,
  asaasClient: platformAsaasClient,
});
const reconciliationService = new ReconciliationService({
  obligationRepository,
  subscriptionEventRepository,
  asaasClient: platformAsaasClient,
});
const billingPayerService = new BillingPayerService({ billingPayerRepository, asaasClient: platformAsaasClient });
// Pedido explícito do usuário (follow-up) — automação de postagens no Instagram.
const instagramPostRepository = new InstagramPostMongooseRepository();
const instagramGraphClient = new FacebookGraphClient(
  environment.facebook.appId ?? '',
  environment.facebook.appSecret ?? '',
  environment.facebook.graphBaseUrl,
);
const publishDueInstagramPostsService = new PublishDueInstagramPostsService(
  instagramPostRepository,
  restaurantRepository,
  instagramGraphClient,
);
const platformBillingCycleService = new PlatformBillingCycleService({
  restaurantRepository,
  obligationRepository,
  annualSubscriptionRepository,
  pixAvailabilityExceptionRepository,
  platformBillingActivationRepository,
  closeMonthlyBillingService,
  annualSubscriptionService,
  obligationIssuanceService,
  reconciliationService,
});

server
  .bootstrap([
    new SupportController(
      new SupportSettingsMongooseRepository(),
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    // specs/0183-conteudo-pagina-inicial — conteúdo da home pública e depoimentos.
    new LandingContentController(
      new LandingContentMongooseRepository(),
      new LandingTestimonialMongooseRepository(),
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    new SuggestionsController(
      new SuggestionRepository(),
      restaurantRepository,
      restaurantOperatorMiddleware,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    new RestaurantsController(restaurantRepository, restaurantOperatorMiddleware),
    new RestaurantSignupController(
      restaurantRepository,
      restaurantOperatorRepository,
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      new AdditionalGroupTemplateMongooseRepository(),
      new ReferralMongooseRepository(),
      new ReferralCodeMongooseRepository(),
      new RawMaterialMongooseRepository(),
      resellerRepository,
      resellerClientRepository,
    ),
    new OnboardingChecklistController(
      restaurantRepository,
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      restaurantOperatorMiddleware,
    ),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware, emailService),
    new CatalogController(
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      restaurantOperatorMiddleware,
      orderRepository,
      new AdditionalGroupTemplateMongooseRepository(),
      new S3ProductImageStorage(s3Client, environment.s3.bucket, environment.s3.region),
      stockMovementRepository,
      restaurantRepository,
    ),
    new OrdersController(
      orderRepository,
      restaurantRepository,
      restaurantOperatorMiddleware,
      whatsAppNotificationService,
      cashRegisterService,
      paymentRepository,
      couponRepository,
      productRepository,
      stockMovementRepository,
      customerRepository,
      // specs/0137-papeis-garcom-motoboy REQ-6 — atribuição de motoboy ao pedido agora valida
      // contra `RestaurantOperator` (papel `motoboy`), não mais contra `IMotoboyRepository`.
      restaurantOperatorRepository,
      // specs/0042 — faixa de faturamento recalculada a cada pedido entregue.
      new RecomputeRestaurantBillingUseCase({
        restaurantRepository,
        orderRepository,
        notifier: new BillingNotifier(whatsAppConnectionService),
        billingSettingsRepository,
      }),
      new RestaurantTableMongooseRepository(),
      rawMaterialRepository,
      blockedCustomerRepository,
      customerBalanceService,
    ),
    new BillingController(restaurantRepository, orderRepository, restaurantOperatorMiddleware, billingSettingsRepository),
    // Pedido explícito do usuário — página "Bloquear cliente".
    new CustomerBlockingController(blockedCustomerRepository, customerRepository, restaurantOperatorMiddleware),
    // Pedido explícito do usuário — impressão automática (specs/0139).
    new AutoPrintController(
      orderRepository,
      restaurantRepository,
      customerRepository,
      buildPrintApiKeyMiddleware(restaurantRepository),
      restaurantOperatorMiddleware,
    ),
    // specs/0155-app-totem-autoatendimento — pareamento/cardápio/criação de pedido do totem
    // físico, escopado pela própria chave (mesmo molde de `AutoPrintController` acima).
    new TotemController(
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      orderRepository,
      restaurantRepository,
      customerRepository,
      buildTotemApiKeyMiddleware(restaurantRepository),
      restaurantOperatorMiddleware,
      stockMovementRepository,
      rawMaterialRepository,
    ),
    // specs/0174-pdv-extensao-chrome-lateral — dois rascunhos de pedido sincronizados entre a
    // extensão Chrome e o PDV web, restritos a Dono/Gerente/Caixa (REQ-5), e finalização
    // idempotente/concorrente segura reaproveitando o motor de preço/estoque de `POST /orders`.
    new OperatorDraftsController(
      new OperatorDraftMongooseRepository(),
      orderRepository,
      restaurantRepository,
      customerRepository,
      new AddressMongooseRepository(),
      blockedCustomerRepository,
      couponRepository,
      restaurantOperatorMiddleware,
      stockMovementRepository,
      rawMaterialRepository,
      productRepository,
    ),
    // specs/0140-confirmacao-automatica-pix REQ-1b — webhook gateway-agnóstico de confirmação de Pix.
    new PaymentWebhookController(
      orderRepository,
      paymentRepository,
      restaurantRepository,
      whatsAppNotificationService,
      buildPaymentWebhookApiKeyMiddleware(restaurantRepository),
      restaurantOperatorMiddleware,
    ),
    // specs/0101-integracao-asaas (fase 1) — cobrança de Pix via gateway real.
    new AsaasOnboardingController(restaurantRepository, restaurantOperatorMiddleware),
    new AsaasWebhookController(orderRepository, paymentRepository, restaurantRepository, whatsAppNotificationService),
    // specs/0170-integracao-mercado-pago — cobrança de cartão de crédito via Checkout Pro.
    new MercadoPagoOAuthController(restaurantRepository, restaurantOperatorMiddleware),
    new InstagramAutomationController(restaurantRepository, instagramPostRepository, restaurantOperatorMiddleware),
    new MercadoPagoWebhookController(orderRepository, paymentRepository, restaurantRepository, whatsAppNotificationService),
    // specs/0106 — painel da plataforma, restrito à lista PLATFORM_ADMIN_EMAILS.
    new PlatformController(
      restaurantRepository,
      orderRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
      billingSettingsRepository,
      obligationRepository,
      annualSubscriptionRepository,
      billingPayerRepository,
      subscriptionEventRepository,
      pixAvailabilityExceptionRepository,
      platformBillingCycleService,
      obligationIssuanceService,
      reconciliationService,
    ),
    // specs/0175-cobranca-assinatura-asaas — API do lojista (planos, pagador, Pix, anual) e
    // webhook da assinatura (credencial/endpoint próprios, nunca os de pedido).
    new PlatformBillingController({
      restaurantOperatorMiddlewareWithoutBillingGuard,
      billingSettingsRepository,
      billingPayerRepository,
      obligationRepository,
      annualSubscriptionRepository,
      pixAvailabilityExceptionRepository,
      billingPayerService,
      annualSubscriptionService,
      reconciliationService,
      orderRepository,
    }),
    new PlatformBillingWebhookController({
      obligationRepository,
      subscriptionEventRepository,
      platformBillingCycleService,
      webhookToken: environment.platformBilling.webhookToken ?? '',
    }),
    // specs/0113-parametrizacao-faixas-cobranca.
    new BillingSettingsController(
      billingSettingsRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    // specs/0123-prospeccao-restaurantes-google-maps / specs/0124-campanha-whatsapp-prospects —
    // painel da plataforma, mesmo acesso de PlatformController.
    new ProspectsController(
      new GooglePlacesService(environment.googleMaps.placesApiKey),
      prospectRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
      prospectOutreachService,
    ),
    // specs/0124-campanha-whatsapp-prospects REQ-2 — pareamento da sessão de WhatsApp da plataforma.
    new PlatformWhatsAppConnectionController(
      platformWhatsAppConnectionService,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    new RawMaterialsController(rawMaterialRepository, productRepository, restaurantOperatorMiddleware, stockMovementRepository),
    new AdditionalGroupTemplatesController(
      new AdditionalGroupTemplateMongooseRepository(),
      productRepository,
      restaurantOperatorMiddleware,
    ),
    new CustomersController(
      customerRepository,
      new AddressMongooseRepository(),
      new FavoriteMongooseRepository(),
      orderRepository,
      emailService,
      customerPixKeyRepository,
    ),
    new CustomersSummaryController(
      new CustomerSummaryMongooseRepository(),
      orderRepository,
      restaurantOperatorMiddleware,
      new AddressMongooseRepository(),
      customerBalanceService,
      customerRepository,
    ),
    new CustomerBalanceController(customerBalanceService, restaurantRepository),
    new CustomerPaymentMethodsController(customerRepository, restaurantRepository, restaurantOperatorMiddleware),
    new WhatsAppConnectionController(whatsAppConnectionService, restaurantOperatorMiddleware),
    new AccountsPayableController(new AccountPayableMongooseRepository(), cashRegisterRepository, restaurantOperatorMiddleware),
    new AccountsReceivableController(new AccountReceivableMongooseRepository(), cashRegisterRepository, restaurantOperatorMiddleware),
    new CashRegisterController(cashRegisterRepository, orderRepository, cashRegisterService, restaurantOperatorMiddleware),
    new TableServiceController(
      new RestaurantTableMongooseRepository(),
      new TableWaiterMongooseRepository(),
      new TableMapLayoutMongooseRepository(),
      orderRepository,
      customerRepository,
      productRepository,
      restaurantRepository,
      new StockReservationService(productRepository, rawMaterialRepository, stockMovementRepository),
      restaurantOperatorMiddleware,
      restaurantOperatorRepository,
      cashRegisterService,
    ),
    new SuppliersController(new SupplierMongooseRepository(), restaurantOperatorMiddleware),
    new MotoboysController(new MotoboyMongooseRepository(), restaurantOperatorMiddleware),
    new PurchaseOrdersController(purchaseOrderRepository, receivePurchaseOrderService, restaurantOperatorMiddleware, rawMaterialRepository, productRepository),
    new CouponsController(couponRepository, orderRepository, restaurantOperatorMiddleware),
    new CampaignsController(campaignRepository, campaignOptOutRepository, campaignDispatchService, restaurantOperatorMiddleware),
    new PromotionsController(promotionRepository, restaurantOperatorMiddleware),
    new RatingsController(new RatingMongooseRepository(), orderRepository, restaurantRepository, restaurantOperatorMiddleware),
    new PresenceController(new PresenceMongooseRepository(), restaurantRepository, restaurantOperatorMiddleware),
    new UploadsController(restaurantOperatorMiddleware),
    new CustomerReferralsController(new ReferralCodeMongooseRepository(), new ReferralMongooseRepository(), restaurantRepository, customerPixKeyRepository),
    new PlatformReferralsController(
      new ReferralMongooseRepository(),
      customerRepository,
      restaurantRepository,
      customerPixKeyRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
    // specs/0189-painel-revenda.
    new ResellerController(resellerRepository, resellerProspectRepository, resellerClientRepository, restaurantRepository, resellerMiddleware),
    new PlatformResellersController(
      resellerRepository,
      resellerProspectRepository,
      resellerClientRepository,
      restaurantRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
    ),
  ], [
    deactivateDuplicateActiveOperators,
    migrateOperatorRolesToDono,
    backfillManualBestSellers,
    backfillStockTracking,
    // specs/0175-cobranca-assinatura-asaas REQ-34.
    () => activatePlatformBilling({ activationRepository: platformBillingActivationRepository, settingsVersionRepository: billingSettingsVersionRepository, billingSettingsRepository }),
  ])
  // specs/0066 REQ-1 — sessões do Baileys vivem em memória; sem isto todo restart do container
  // derruba o envio de WhatsApp em silêncio. specs/0124 — mesma lógica pra sessão da plataforma.
  .then(() =>
    Promise.all([whatsAppConnectionService.restoreConnectedSessions(), platformWhatsAppConnectionService.restoreConnectedSession()]),
  )
  // specs/0175-cobranca-assinatura-asaas REQ-9 — sweep disparado uma vez no boot (fire-and-forget:
  // nunca atrasa nem derruba a inicialização do servidor; erro só logado, nunca propagado). A
  // migração acima já rodou antes deste `.then()` (está dentro de `bootstrap`), garantindo que
  // `PlatformBillingActivation`/a versão 1 das configurações já existem quando o ciclo rodar.
  .then(() =>
    platformBillingCycleService.runCycle(new Date()).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[platform-billing] erro inesperado no ciclo disparado no boot:', error);
    }),
  )
  // Pedido explícito do usuário (follow-up) — automação de postagens no Instagram precisa de
  // execução autônoma de verdade pra cumprir o que promete ("agendadas"): diferente do ciclo de
  // cobrança acima (que tolera um empurrão externo — `docs/CHECKLIST-ATIVACAO-COBRANCA-ASSINATURA.md`
  // §5 documenta "sem setInterval/cron real neste BFF ainda... até uma automação própria
  // existir"), uma postagem agendada sem ninguém rodando o publicador simplesmente nunca sai. Por
  // isso, primeiro `setInterval` em processo deste BFF — desvio deliberado e documentado da
  // decisão anterior, não um precedente esquecido. 60s: intervalo curto o bastante pra o horário
  // agendado "bater" com precisão aceitável pro caso de uso (postagem de rede social, não
  // cobrança financeira), sem sobrecarregar a Graph API com polling agressivo.
  .then(() => {
    setInterval(() => {
      publishDueInstagramPostsService.run().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[instagram-automation] erro inesperado no publicador:', error);
      });
    }, 60_000);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
