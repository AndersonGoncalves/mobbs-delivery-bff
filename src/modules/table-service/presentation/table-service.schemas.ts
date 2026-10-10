import { z } from 'zod';

export interface TableSelectionInput {
  groupName: string;
  optionName: string;
  nestedSelections?: TableSelectionInput[];
}

export const saveTableSchema = z.object({
  name: z.string().trim().min(1, 'Nome da mesa é obrigatório'),
  capacity: z.number().int().positive().optional(),
});

export const createTableRangeSchema = z
  .object({ from: z.number().int().positive(), to: z.number().int().positive() })
  .refine(({ from, to }) => to >= from && to - from < 100, 'Faixa inválida (máximo de 100 mesas)');

export const tablePositionSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().min(80),
  height: z.number().min(60),
});

export const updateTablePositionSchema = z.object({ position: tablePositionSchema });

export const saveTableWaiterSchema = z.object({ name: z.string().trim().min(1, 'Nome do garçom é obrigatório') });

const tableMapDecorationSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1),
  type: z.enum(['wall', 'bar', 'kitchen', 'entrance', 'other']),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().min(24),
  height: z.number().min(24),
});

export const saveTableMapLayoutSchema = z.object({
  decorations: z.array(tableMapDecorationSchema).max(100),
  spendingLimit: z.number().positive().nullable().optional(),
});

const tableSelectionSchema: z.ZodType<TableSelectionInput> = z.lazy(() =>
  z.object({
    groupName: z.string().min(1),
    optionName: z.string().min(1),
    nestedSelections: z.array(tableSelectionSchema).optional(),
  }),
);

export const openTableOrderSchema = z.object({
  tableId: z.string().min(1).nullable().optional(),
  waiterId: z.string().min(1).nullable().optional(),
});

export const updateTableOrderItemQuantitySchema = z.object({ quantity: z.number().int().min(0).max(99) });
export const transferTableOrderSchema = z.object({ tableId: z.string().min(1) });

export const addTableOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  selections: z.array(tableSelectionSchema).default([]),
  notes: z.string().max(500).optional(),
});

export const tableOrderAdjustmentsSchema = z.object({
  serviceChargePercent: z.number().min(0).max(100).optional(),
  coverCharge: z.number().nonnegative().optional(),
  adjustment: z.object({
    type: z.enum(['discount', 'surcharge']),
    mode: z.enum(['fixed', 'percent']),
    value: z.number().nonnegative(),
  }).nullable().optional(),
  peopleCount: z.number().int().positive().nullable().optional(),
});

const tablePaymentSchema = z.object({
  method: z.enum(['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer']),
  amount: z.number().positive(),
});

export const addTablePaymentSchema = tablePaymentSchema;
export const closeTableOrderSchema = z.object({ payments: z.array(tablePaymentSchema).default([]) });
const tableHistoryDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');
export const tableOrderHistoryQuerySchema = z.object({ from: tableHistoryDateSchema, to: tableHistoryDateSchema })
  .refine(({ from, to }) => new Date(from).getTime() < new Date(to).getTime(), 'Período inválido');
export const tableOrderIdSchema = z.object({ orderId: z.string().min(1) });
