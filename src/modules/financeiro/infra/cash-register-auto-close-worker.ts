import { ICashRegisterService } from '../domain/services/i-cash-register.service';

/**
 * specs/0216-fechamento-automatico-caixa REQ-3 — disparo periódico do fechamento automático de
 * caixa (`CashRegisterService.closeDueAutomaticSessions`). Worker dedicado (não reativo, ao
 * contrário de `ensureAutomaticSchedule`/abertura): fechamento é tipicamente de madrugada
 * (default 04:00), horário em que é bem provável que ninguém acesse nenhuma rota do caixa
 * daquele restaurante por horas — sem um "tick" em processo, a sessão ficaria presa aberta até
 * alguém abrir a tela de manhã, nem sempre batendo com o horário configurado.
 */
export class CashRegisterAutoCloseWorker {
  constructor(private readonly cashRegisterService: ICashRegisterService) {}

  async run(): Promise<void> {
    await this.cashRegisterService.closeDueAutomaticSessions();
  }
}
