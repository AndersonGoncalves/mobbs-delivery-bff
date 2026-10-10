import { OrderModel } from './order.mongoose.model';

const baseOrder = {
  orderNumber: 1,
  trackingToken: 'tracking-token',
  customerId: 'customer-1',
  restaurantId: 'restaurant-1',
  items: [],
  orderType: 'delivery',
  status: 'aguardandoConfirmacao',
  statusHistory: [{ status: 'aguardandoConfirmacao', changedAt: new Date() }],
  subtotal: 0,
  deliveryFee: 0,
  discount: 0,
  total: 0,
  paymentMethod: 'cash',
};

describe('OrderModel optional assignment snapshots', () => {
  it('allows delivery and table orders without assigned motoboy or waiter', async () => {
    await expect(new OrderModel(baseOrder).validate()).resolves.toBeUndefined();
    await expect(new OrderModel({ ...baseOrder, orderType: 'table' }).validate()).resolves.toBeUndefined();
  });

  it('requires both fields when an assignment snapshot is present', async () => {
    const order = new OrderModel({ ...baseOrder, deliveryMotoboy: { id: 'motoboy-1' } });

    await expect(order.validate()).rejects.toMatchObject({
      errors: { 'deliveryMotoboy.name': expect.anything() },
    });
  });
});