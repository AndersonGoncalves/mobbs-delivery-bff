import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import { AutomaticCashEntryInput, ICashRegisterService } from '../../domain/services/i-cash-register.service';

/**
 * specs/0014-financeiro REQ-5 — chamado pelo `OrdersController` ao marcar um pedido como
 * entregue/retirado (`docs/architecture/data-model.md`, único status que cobre os dois casos).
 * Regra completa fica **aqui** (não no controller de orders), pra manter as duas condições de
 * REQ-5 num único lugar testável: só `pix` lança automaticamente, e só se houver sessão de caixa
 * aberta (nunca força abertura).
 */
export class CashRegisterService implements ICashRegisterService {
  constructor(private readonly cashRegisterRepository: ICashRegisterRepository) {}

  async addAutomaticEntry(input: AutomaticCashEntryInput): Promise<void> {
    if (input.paymentMethod !== 'pix') return;

    const session = await this.cashRegisterRepository.findOpenSessionByRestaurant(input.restaurantId);
    if (!session) return;

    await this.cashRegisterRepository.addMovement(session.id, {
      type: 'entrada',
      amount: input.amount,
      description: `Venda #${input.orderNumber} (Pix)`,
      orderId: input.orderId,
    });
  }
}
