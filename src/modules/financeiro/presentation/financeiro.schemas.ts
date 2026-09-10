import { z } from 'zod';

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');

/** REQ-1/REQ-3 — mesmo formato pra criar e editar (título a pagar ou a receber). */
export const saveAccountPayableSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  supplierId: z.string().min(1).optional(),
  issueDate: isoDateString,
  dueDate: isoDateString,
  value: z.number().positive('Valor deve ser maior que zero'),
});

export const saveAccountReceivableSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória'),
  customerId: z.string().min(1).optional(),
  issueDate: isoDateString,
  dueDate: isoDateString,
  value: z.number().positive('Valor deve ser maior que zero'),
});

/** REQ-2 — `paidAt` é opcional no corpo (default "agora" se omitido). */
export const markAccountPayablePaidSchema = z.object({
  paidValue: z.number().positive('Valor pago deve ser maior que zero'),
  paidAt: isoDateString.optional(),
});

export const markAccountReceivablePaidSchema = z.object({
  receivedValue: z.number().positive('Valor recebido deve ser maior que zero'),
  receivedAt: isoDateString.optional(),
});

/** REQ-4 — valor inicial não pode ser negativo (pode ser zero, ex.: sem troco inicial). */
export const openCashRegisterSchema = z.object({
  openingBalance: z.number().nonnegative('Valor inicial não pode ser negativo'),
});

/** REQ-6 — lançamento manual, entrada ou saída. */
export const addCashMovementSchema = z.object({
  type: z.enum(['entrada', 'saida']),
  amount: z.number().positive('Valor deve ser maior que zero'),
  description: z.string().min(1, 'Descrição é obrigatória'),
});

/** REQ-7 — valor contado fisicamente no fechamento. */
export const closeCashRegisterSchema = z.object({
  countedValue: z.number().nonnegative('Valor contado não pode ser negativo'),
});
