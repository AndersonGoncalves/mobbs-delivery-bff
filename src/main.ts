import { Server } from './shared/http/server';
import { buildRestaurantOperatorMiddleware } from './shared/http/restaurant-operator.middleware';
import { RestaurantMongooseRepository } from './modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantsController } from './modules/restaurants/presentation/restaurants.controller';
import { RestaurantSignupController } from './modules/restaurants/presentation/restaurant-signup.controller';
import { OnboardingChecklistController } from './modules/restaurants/presentation/onboarding-checklist.controller';
import { RestaurantOperatorMongooseRepository } from './modules/restaurant-operators/infra/repositories/restaurant-operator.mongoose.repository';
import { migrateOperatorRolesToDono } from './modules/restaurant-operators/infra/migrations/migrate-operator-roles-to-dono';
import { backfillManualBestSellers } from './modules/catalog/infra/migrations/backfill-manual-best-sellers';
import { ReferralMongooseRepository } from './modules/referrals/infra/repositories/referral.mongoose.repository';
import { ReferralCodeMongooseRepository } from './modules/referrals/infra/repositories/referral-code.mongoose.repository';
import { CustomerPixKeyMongooseRepository } from './modules/referrals/infra/repositories/customer-pix-key.mongoose.repository';
import { CustomerReferralsController } from './modules/referrals/presentation/customer-referrals.controller';
import { PlatformReferralsController } from './modules/referrals/presentation/platform-referrals.controller';
import { RestaurantOperatorsController } from './modules/restaurant-operators/presentation/restaurant-operators.controller';
import { MenuCategoryMongooseRepository } from './modules/catalog/infra/repositories/menu-category.mongoose.repository';
import { ProductMongooseRepository } from './modules/catalog/infra/repositories/product.mongoose.repository';
import { S3ProductImageStorage } from './modules/catalog/infra/storage/s3-product-image-storage';
import { CatalogController } from './modules/catalog/presentation/catalog.controller';
import { environment } from './shared/config/environment';
import { s3Client } from './shared/storage/s3-client';
import { OrderMongooseRepository } from './modules/orders/infra/repositories/order.mongoose.repository';
import { PaymentMongooseRepository } from './modules/orders/infra/repositories/payment.mongoose.repository';
import { OrdersController } from './modules/orders/presentation/orders.controller';
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
import { FavoriteMongooseRepository } from './modules/customers/infra/repositories/favorite.mongoose.repository';
import { CustomersController } from './modules/customers/presentation/customers.controller';
import { CustomerSummaryMongooseRepository } from './modules/customers-admin/infra/repositories/customer-summary.mongoose.repository';
import { CustomersSummaryController } from './modules/customers-admin/presentation/customers-summary.controller';
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

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantRepository = new RestaurantMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository, restaurantRepository);
// specs/0044-promocoes-produtos — instância única, compartilhada por ProductMongooseRepository
// (preço/percentual promocional + desconto em opção vinculada) e MenuCategoryMongooseRepository
// (versão leve do cardápio por categoria), além do PromotionsController (CRUD da retaguarda).
const promotionRepository = new PromotionMongooseRepository();
const productRepository = new ProductMongooseRepository(promotionRepository);
const customerRepository = new CustomerMongooseRepository();
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
const cashRegisterRepository = new CashRegisterMongooseRepository();
const cashRegisterService = new CashRegisterService(cashRegisterRepository);

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

server
  .bootstrap([
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
    ),
    new OnboardingChecklistController(
      restaurantRepository,
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      restaurantOperatorMiddleware,
    ),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware),
    new CatalogController(
      new MenuCategoryMongooseRepository(promotionRepository),
      productRepository,
      restaurantOperatorMiddleware,
      orderRepository,
      new AdditionalGroupTemplateMongooseRepository(),
      new S3ProductImageStorage(s3Client, environment.s3.bucket, environment.s3.region),
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
      new MotoboyMongooseRepository(),
      // specs/0042 — faixa de faturamento recalculada a cada pedido entregue.
      new RecomputeRestaurantBillingUseCase({
        restaurantRepository,
        orderRepository,
        notifier: new BillingNotifier(whatsAppConnectionService),
        billingSettingsRepository,
      }),
      new RestaurantTableMongooseRepository(),
    ),
    new BillingController(restaurantRepository, orderRepository, restaurantOperatorMiddleware, billingSettingsRepository),
    // specs/0106 — painel da plataforma, restrito à lista PLATFORM_ADMIN_EMAILS.
    new PlatformController(
      restaurantRepository,
      orderRepository,
      buildPlatformAdminMiddleware(parsePlatformAdminEmails(process.env.PLATFORM_ADMIN_EMAILS)),
      billingSettingsRepository,
    ),
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
    ),
    new WhatsAppConnectionController(whatsAppConnectionService, restaurantOperatorMiddleware),
    new AccountsPayableController(new AccountPayableMongooseRepository(), restaurantOperatorMiddleware),
    new AccountsReceivableController(new AccountReceivableMongooseRepository(), restaurantOperatorMiddleware),
    new CashRegisterController(cashRegisterRepository, orderRepository, restaurantOperatorMiddleware),
    new TableServiceController(
      new RestaurantTableMongooseRepository(),
      new TableWaiterMongooseRepository(),
      new TableMapLayoutMongooseRepository(),
      orderRepository,
      customerRepository,
      productRepository,
      restaurantOperatorMiddleware,
    ),
    new SuppliersController(new SupplierMongooseRepository(), restaurantOperatorMiddleware),
    new MotoboysController(new MotoboyMongooseRepository(), restaurantOperatorMiddleware),
    new PurchaseOrdersController(purchaseOrderRepository, receivePurchaseOrderService, restaurantOperatorMiddleware),
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
  ], [migrateOperatorRolesToDono, backfillManualBestSellers])
  // specs/0066 REQ-1 — sessões do Baileys vivem em memória; sem isto todo restart do container
  // derruba o envio de WhatsApp em silêncio. specs/0124 — mesma lógica pra sessão da plataforma.
  .then(() =>
    Promise.all([whatsAppConnectionService.restoreConnectedSessions(), platformWhatsAppConnectionService.restoreConnectedSession()]),
  )
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
