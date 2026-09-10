import { Server } from './shared/http/server';
import { buildRestaurantOperatorMiddleware } from './shared/http/restaurant-operator.middleware';
import { RestaurantMongooseRepository } from './modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantsController } from './modules/restaurants/presentation/restaurants.controller';
import { RestaurantOperatorMongooseRepository } from './modules/restaurant-operators/infra/repositories/restaurant-operator.mongoose.repository';
import { RestaurantOperatorsController } from './modules/restaurant-operators/presentation/restaurant-operators.controller';
import { MenuCategoryMongooseRepository } from './modules/catalog/infra/repositories/menu-category.mongoose.repository';
import { ProductMongooseRepository } from './modules/catalog/infra/repositories/product.mongoose.repository';
import { CatalogController } from './modules/catalog/presentation/catalog.controller';
import { OrderMongooseRepository } from './modules/orders/infra/repositories/order.mongoose.repository';
import { PaymentMongooseRepository } from './modules/orders/infra/repositories/payment.mongoose.repository';
import { OrdersController } from './modules/orders/presentation/orders.controller';
import { RawMaterialMongooseRepository } from './modules/raw-materials/infra/repositories/raw-material.mongoose.repository';
import { StockMovementMongooseRepository } from './modules/raw-materials/infra/repositories/stock-movement.mongoose.repository';
import { RawMaterialsController } from './modules/raw-materials/presentation/raw-materials.controller';
import { SupplierMongooseRepository } from './modules/suppliers/infra/repositories/supplier.mongoose.repository';
import { SuppliersController } from './modules/suppliers/presentation/suppliers.controller';
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
import { WhatsAppConnectionService } from './modules/whatsapp-connection/infra/whatsapp-connection.service';
import { WhatsAppConnectionController } from './modules/whatsapp-connection/presentation/whatsapp-connection.controller';

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository);
const restaurantRepository = new RestaurantMongooseRepository();
const productRepository = new ProductMongooseRepository();
const customerRepository = new CustomerMongooseRepository();

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
);

// specs/0016-clientes-retaguarda — mesma instância de `OrderMongooseRepository` compartilhada
// entre `OrdersController` e `CustomersSummaryController` (REQ-3, histórico de pedidos do
// cliente escopado ao restaurante), sem duplicar instância.
const orderRepository = new OrderMongooseRepository();

// specs/0020-pix-no-app — primeiro consumidor real de `Payment` (coleção já existia, sem
// repository próprio até aqui); mesma instância usada pra ler status e confirmar recebimento.
const paymentRepository = new PaymentMongooseRepository();

server
  .bootstrap([
    new RestaurantsController(restaurantRepository, restaurantOperatorMiddleware),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware),
    new CatalogController(new MenuCategoryMongooseRepository(), productRepository, restaurantOperatorMiddleware),
    new OrdersController(
      orderRepository,
      restaurantRepository,
      restaurantOperatorMiddleware,
      whatsAppNotificationService,
      cashRegisterService,
      paymentRepository,
    ),
    new RawMaterialsController(rawMaterialRepository, productRepository, restaurantOperatorMiddleware, stockMovementRepository),
    new CustomersController(customerRepository, new AddressMongooseRepository(), new FavoriteMongooseRepository()),
    new CustomersSummaryController(new CustomerSummaryMongooseRepository(), orderRepository, restaurantOperatorMiddleware),
    new WhatsAppConnectionController(whatsAppConnectionService, restaurantOperatorMiddleware),
    new AccountsPayableController(new AccountPayableMongooseRepository(), restaurantOperatorMiddleware),
    new AccountsReceivableController(new AccountReceivableMongooseRepository(), restaurantOperatorMiddleware),
    new CashRegisterController(cashRegisterRepository, restaurantOperatorMiddleware),
    new SuppliersController(new SupplierMongooseRepository(), restaurantOperatorMiddleware),
    new PurchaseOrdersController(purchaseOrderRepository, receivePurchaseOrderService, restaurantOperatorMiddleware),
  ])
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
