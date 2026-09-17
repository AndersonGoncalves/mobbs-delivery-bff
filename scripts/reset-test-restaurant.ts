/**
 * specs/0040-reset-restaurante-teste — apaga um restaurante de teste e tudo que pertence só a
 * ele (catálogo, pedidos, financeiro, estoque, avaliações, cupons, operadores), mais as contas
 * Firebase Authentication dos e-mails vinculados — pra poder reaproveitar o mesmo slug e o mesmo
 * e-mail em rodadas de teste repetidas, sem esbarrar em "slug já existe"
 * (`generateUniqueSlug`) nem em "e-mail já cadastrado" (`auth/email-already-in-use`).
 *
 * Idempotente (REQ-3): se o slug não existir, só loga e sai com código 0, sem erro.
 *
 * Uso:
 *   npm run reset:test-restaurant -- --slug=meu-restaurante
 *
 * `--slug` é opcional, default `meu-restaurante` (ADR-0040-02) — reflete o uso real declarado:
 * o mesmo restaurante reaproveitado em toda rodada de teste.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as admin from 'firebase-admin';

dotenv.config({ path: '.env' });

import { ensureFirebaseAdminInitialized } from '../src/shared/config/firebase-admin';
import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { RestaurantOperatorModel } from '../src/modules/restaurant-operators/infra/models/restaurant-operator.mongoose.model';
import { ProductModel } from '../src/modules/catalog/infra/models/product.mongoose.model';
import { MenuCategoryModel } from '../src/modules/catalog/infra/models/menu-category.mongoose.model';
import { AdditionalGroupTemplateModel } from '../src/modules/additional-group-templates/infra/models/additional-group-template.mongoose.model';
import { OrderModel } from '../src/modules/orders/infra/models/order.mongoose.model';
import { OrderCounterModel } from '../src/modules/orders/infra/models/order-counter.mongoose.model';
import { PaymentModel } from '../src/modules/orders/infra/models/payment.mongoose.model';
import { RatingModel } from '../src/modules/ratings/infra/models/rating.mongoose.model';
import { CouponModel } from '../src/modules/coupons/infra/models/coupon.mongoose.model';
import { FavoriteModel } from '../src/modules/customers/infra/models/favorite.mongoose.model';
import { CashRegisterSessionModel } from '../src/modules/financeiro/infra/models/cash-register-session.mongoose.model';
import { CashMovementEntryModel } from '../src/modules/financeiro/infra/models/cash-movement-entry.mongoose.model';
import { AccountPayableModel } from '../src/modules/financeiro/infra/models/account-payable.mongoose.model';
import { AccountReceivableModel } from '../src/modules/financeiro/infra/models/account-receivable.mongoose.model';
import { RawMaterialModel } from '../src/modules/raw-materials/infra/models/raw-material.mongoose.model';
import { StockMovementModel } from '../src/modules/raw-materials/infra/models/stock-movement.mongoose.model';
import { SupplierModel } from '../src/modules/suppliers/infra/models/supplier.mongoose.model';
import { PurchaseOrderModel } from '../src/modules/purchase-orders/infra/models/purchase-order.mongoose.model';
import { WhatsAppSessionModel } from '../src/modules/whatsapp-connection/infra/models/whatsapp-session.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

/** Coleções ligadas direto por `restaurantId` — `deleteMany({ restaurantId })` basta. */
const DIRECT_MODELS = [
  { label: 'product', model: ProductModel },
  { label: 'menuCategory', model: MenuCategoryModel },
  { label: 'additionalGroupTemplate', model: AdditionalGroupTemplateModel },
  { label: 'order', model: OrderModel },
  { label: 'rating', model: RatingModel },
  { label: 'coupon', model: CouponModel },
  { label: 'favorite', model: FavoriteModel },
  { label: 'cashRegisterSession', model: CashRegisterSessionModel },
  { label: 'accountPayable', model: AccountPayableModel },
  { label: 'accountReceivable', model: AccountReceivableModel },
  { label: 'rawMaterial', model: RawMaterialModel },
  { label: 'stockMovement', model: StockMovementModel },
  { label: 'supplier', model: SupplierModel },
  { label: 'purchaseOrder', model: PurchaseOrderModel },
  { label: 'whatsapp_session', model: WhatsAppSessionModel },
  { label: 'restaurantOperator', model: RestaurantOperatorModel },
];

async function deleteFirebaseUsers(emails: string[]): Promise<string[]> {
  ensureFirebaseAdminInitialized();
  const removed: string[] = [];
  for (const email of emails) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().deleteUser(user.uid);
      removed.push(email);
    } catch (error) {
      // `auth/user-not-found` é um estado válido (já não existe) — não uma falha do script.
      if ((error as { code?: string }).code !== 'auth/user-not-found') {
        console.error(`[reset-test-restaurant] falha ao remover a conta Firebase de ${email}:`, error);
      }
    }
  }
  return removed;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = args.slug ?? 'meu-restaurante';

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);

  const restaurant = await RestaurantModel.findOne({ slug });
  if (!restaurant) {
    console.log(`[reset-test-restaurant] nenhum restaurante com slug "${slug}" — nada pra limpar.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const restaurantId = restaurant._id as string;

  const operators = await RestaurantOperatorModel.find({ restaurantId });
  const emails = operators.map((operator) => operator.email);
  const removedEmails = await deleteFirebaseUsers(emails);

  // `cashMovementEntry` é ligado por `cashRegisterSessionId`, não `restaurantId` direto.
  const sessionIds = (await CashRegisterSessionModel.find({ restaurantId }, { _id: 1 })).map((doc) => doc._id);
  const cashMovementResult = await CashMovementEntryModel.deleteMany({ cashRegisterSessionId: { $in: sessionIds } });

  // `payment` é ligado por `orderId`, não `restaurantId` direto.
  const orderIds = (await OrderModel.find({ restaurantId }, { _id: 1 })).map((doc) => doc._id);
  const paymentResult = await PaymentModel.deleteMany({ orderId: { $in: orderIds } });

  const results: Record<string, number> = {
    cashMovementEntry: cashMovementResult.deletedCount ?? 0,
    payment: paymentResult.deletedCount ?? 0,
  };
  for (const { label, model } of DIRECT_MODELS) {
    const result = await model.deleteMany({ restaurantId });
    results[label] = result.deletedCount ?? 0;
  }

  // `order_counter`: `_id` é o próprio `restaurantId`, não um campo separado.
  const orderCounterResult = await OrderCounterModel.deleteOne({ _id: restaurantId });
  results['order_counter'] = orderCounterResult.deletedCount ?? 0;

  await RestaurantModel.deleteOne({ _id: restaurantId });

  console.log(`\n[reset-test-restaurant] restaurante "${slug}" (${restaurantId}) removido.`);
  console.log('Documentos apagados por coleção:');
  for (const [label, count] of Object.entries(results)) {
    if (count > 0) console.log(`  ${label}: ${count}`);
  }
  console.log(`Contas Firebase removidas: ${removedEmails.length ? removedEmails.join(', ') : '(nenhuma)'}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error('[reset-test-restaurant] falha:', error);
  process.exit(1);
});
