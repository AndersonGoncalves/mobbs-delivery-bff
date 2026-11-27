import { OrderModel } from '../models/order.mongoose.model';
import { PaymentModel } from '../models/payment.mongoose.model';
import { PaymentMongooseRepository } from './payment.mongoose.repository';

// specs/0226 REQ-A15 — mock dos Models (mesmo padrão-exceção de order.mongoose.repository.spec.ts):
// é a própria consulta que decide se o "Desvincular" do Mercado Pago é bloqueado.
jest.mock('../models/order.mongoose.model', () => ({ OrderModel: { find: jest.fn() } }));
jest.mock('../models/payment.mongoose.model', () => ({ PaymentModel: { find: jest.fn() } }));

function mockFind(model: { find: unknown }, docs: unknown[]) {
  (model.find as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) });
}

describe('PaymentMongooseRepository.findOpenOrderNumbersWithPendingMercadoPagoPayment (specs/0226 REQ-A15)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('procura só pedidos abertos do restaurante e pagamentos pendentes do Mercado Pago; devolve os números em ordem', async () => {
    mockFind(OrderModel, [
      { _id: 'o-15', orderNumber: 15 },
      { _id: 'o-12', orderNumber: 12 },
      { _id: 'o-20', orderNumber: 20 },
    ]);
    mockFind(PaymentModel, [{ orderId: 'o-15' }, { orderId: 'o-12' }]);

    const result = await new PaymentMongooseRepository().findOpenOrderNumbersWithPendingMercadoPagoPayment('r-1');

    expect(result).toEqual([12, 15]);
    expect(OrderModel.find).toHaveBeenCalledWith({ restaurantId: 'r-1', status: { $nin: ['entregue', 'cancelado'] } }, { _id: 1, orderNumber: 1 });
    expect(PaymentModel.find).toHaveBeenCalledWith(
      { orderId: { $in: ['o-15', 'o-12', 'o-20'] }, provider: 'mercadopago', status: 'pendente' },
      { orderId: 1 },
    );
  });

  it('sem pedido aberto, não consulta pagamentos', async () => {
    mockFind(OrderModel, []);

    expect(await new PaymentMongooseRepository().findOpenOrderNumbersWithPendingMercadoPagoPayment('r-1')).toEqual([]);
    expect(PaymentModel.find).not.toHaveBeenCalled();
  });
});

// specs/0226 REQ-A19 — cartão online recusado.
describe('PaymentMongooseRepository — cartão recusado (specs/0226 REQ-A19)', () => {
  // O model é substituído por `jest.mock` no topo do arquivo; aqui só ganha o `findOneAndUpdate`.
  function stubUpdate(result: unknown) {
    const update = jest.fn().mockReturnValue({ lean: () => Promise.resolve(result) });
    (PaymentModel as unknown as { findOneAndUpdate: jest.Mock }).findOneAndUpdate = update;
    return update;
  }

  it('markAsRefusedIfPending só muda pagamento PENDENTE para recusado (recusa atrasada não desfaz aprovado)', async () => {
    const update = stubUpdate({ _id: 'p-1', orderId: 'o-1', method: 'creditCardOnline', status: 'recusado', amount: 10 });

    const result = await new PaymentMongooseRepository().markAsRefusedIfPending('o-1');

    expect(update).toHaveBeenCalledWith({ orderId: 'o-1', status: 'pendente' }, { $set: { status: 'recusado' } }, { new: true });
    expect(result?.status).toBe('recusado');
  });

  it('markAsApprovedIfPending aceita pendente OU recusado (nova tentativa no mesmo checkout)', async () => {
    const update = stubUpdate({ _id: 'p-1', orderId: 'o-1', method: 'creditCardOnline', status: 'aprovado', amount: 10 });

    await new PaymentMongooseRepository().markAsApprovedIfPending('o-1');

    expect(update).toHaveBeenCalledWith({ orderId: 'o-1', status: { $in: ['pendente', 'recusado'] } }, { $set: { status: 'aprovado' } }, { new: true });
  });
});
