import { z } from 'zod';

// specs/0171-meios-pagamento-por-cliente — reusa o mesmo enum de `restaurants.schemas.ts`
// (`Order.paymentMethod`/`Restaurant.acceptedPaymentMethods`), em vez de duplicar a constante,
// pra não correr o risco de os dois enums divergirem se um novo meio de pagamento for adicionado
// e só um dos arquivos for atualizado.
import { paymentMethodSchema } from '../../restaurants/presentation/restaurants.schemas';

/**
 * REQ-1/REQ-5 — `null` (ou array vazio) limpa a restrição própria do cliente (volta a "sem
 * restrição", libera tudo que o restaurante aceita); a validação de que cada valor enviado está
 * em `Restaurant.acceptedPaymentMethods` é feita no controller (precisa do restaurante carregado,
 * não dá pra expressar aqui sem acoplar o schema a uma chamada de repositório).
 */
export const updateCustomerAllowedPaymentMethodsSchema = z.object({
  allowedPaymentMethods: z.array(paymentMethodSchema).nullable(),
});
