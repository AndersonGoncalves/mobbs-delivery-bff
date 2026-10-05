import { ForbiddenError } from 'restify-errors';

/** specs/0042 REQ-7 — restaurante bloqueado por inadimplência. O handler de erro devolve `code: 'billing_blocked'`. */
export class BillingBlockedError extends ForbiddenError {
  constructor() {
    super('Acesso suspenso por pendência de pagamento');
    this.name = 'BillingBlockedError';
  }
}
