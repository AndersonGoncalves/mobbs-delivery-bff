import { IAddress, ICustomer, IFavorite } from './entities/customer.entity';
import { IOrder } from '../../orders/domain/entities/order.entity';

export interface CustomerDataExportInput {
  customer: ICustomer;
  addresses: IAddress[];
  orders: IOrder[];
  favorites: IFavorite[];
}

/**
 * specs/0023-portabilidade-dados REQ-2 (AC-1) — agrega tudo que o sistema guarda sobre o
 * `Customer` num objeto JSON estruturado, pronto pra virar o anexo do e-mail. Domain puro (sem
 * I/O), mesma filosofia de `order-receipt-message-builder.ts`/`pix-br-code-builder.ts` —
 * testável sem Mongo/e-mail real.
 */
export function buildCustomerDataExport(input: CustomerDataExportInput): Record<string, unknown> {
  const { customer, addresses, orders, favorites } = input;

  return {
    geradoEm: new Date().toISOString(),
    perfil: {
      id: customer.id,
      nome: customer.name,
      email: customer.email,
      telefone: customer.phone,
      documento: customer.document,
      termosAceitosEm: customer.termsAcceptedAt,
      versaoTermosAceita: customer.termsVersionAccepted,
    },
    enderecos: addresses.map((address) => ({
      id: address.id,
      rotulo: address.label,
      rua: address.street,
      numero: address.number,
      complemento: address.complement,
      bairro: address.neighborhood,
      cidade: address.city,
      estado: address.state,
      cep: address.zipCode,
      padrao: address.isDefault,
    })),
    pedidos: orders.map((order) => ({
      id: order.id,
      numero: order.orderNumber,
      restauranteId: order.restaurantId,
      itens: order.items,
      tipo: order.orderType,
      enderecoEntrega: order.deliveryAddress,
      observacoes: order.notes,
      status: order.status,
      subtotal: order.subtotal,
      taxaEntrega: order.deliveryFee,
      desconto: order.discount,
      total: order.total,
      formaPagamento: order.paymentMethod,
      criadoEm: order.createdAt,
    })),
    favoritos: favorites.map((favorite) => ({
      id: favorite.id,
      restauranteId: favorite.restaurantId,
      produtoId: favorite.productId,
      criadoEm: favorite.createdAt,
    })),
  };
}
