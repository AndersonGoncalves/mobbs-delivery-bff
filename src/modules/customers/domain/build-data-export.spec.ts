import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildCustomerDataExport } from './build-data-export';
import { IAddress, ICustomer, IFavorite } from './entities/customer.entity';

function buildCustomer(overrides: Partial<ICustomer> = {}): ICustomer {
  return { id: 'c-1', name: 'Ana', email: 'ana@example.com', phone: '11999999999', ...overrides };
}

function buildAddress(overrides: Partial<IAddress> = {}): IAddress {
  return {
    id: 'a-1',
    customerId: 'c-1',
    label: 'Casa',
    street: 'Rua A',
    number: '123',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01001000',
    isDefault: true,
    ...overrides,
  };
}

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 123,
    trackingToken: 'abc123',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'X-Burger', quantity: 1, unitPrice: 25 }],
    orderType: 'delivery',
    status: 'entregue',
    statusHistory: [],
    subtotal: 25,
    deliveryFee: 5,
    discount: 0,
    total: 30,
    paymentMethod: 'cash',
    createdAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

function buildFavorite(overrides: Partial<IFavorite> = {}): IFavorite {
  return {
    id: 'f-1',
    customerId: 'c-1',
    restaurantId: 'r-1',
    productId: 'p-1',
    createdAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCustomerDataExport', () => {
  it('AC-1: monta o JSON com perfil, endereços, pedidos e favoritos corretos', () => {
    const result = buildCustomerDataExport({
      customer: buildCustomer(),
      addresses: [buildAddress()],
      orders: [buildOrder()],
      favorites: [buildFavorite()],
    });

    expect(result.perfil).toMatchObject({ id: 'c-1', nome: 'Ana', email: 'ana@example.com', telefone: '11999999999' });
    expect(result.enderecos).toEqual([
      expect.objectContaining({ id: 'a-1', rua: 'Rua A', cidade: 'São Paulo', padrao: true }),
    ]);
    expect(result.pedidos).toEqual([expect.objectContaining({ id: 'o-1', numero: 123, total: 30 })]);
    expect(result.favoritos).toEqual([expect.objectContaining({ id: 'f-1', produtoId: 'p-1' })]);
    expect(result.geradoEm).toEqual(expect.any(String));
  });

  it('lida com listas vazias sem quebrar (cliente novo, sem endereços/pedidos/favoritos)', () => {
    const result = buildCustomerDataExport({
      customer: buildCustomer(),
      addresses: [],
      orders: [],
      favorites: [],
    });

    expect(result.enderecos).toEqual([]);
    expect(result.pedidos).toEqual([]);
    expect(result.favoritos).toEqual([]);
  });
});
