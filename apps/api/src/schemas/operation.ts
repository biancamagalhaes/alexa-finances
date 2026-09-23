import { z } from 'zod';
import { DomainValidationError } from '../lib/errors.js';
import { isoDate, nonNegativeDecimal, positiveDecimal } from './common.js';

const baseOperation = z.object({
  profileSlug: z.enum(['bianca', 'sergio']),
  occurredOn: isoDate,
  idempotencyKey: z.string().trim().min(1).max(128),
  feeAmount: nonNegativeDecimal(2).optional().default('0'),
  notes: z.string().trim().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const instrumentOperation = z.object({
  instrumentId: z.string().uuid(),
});

const tradeOperation = baseOperation.merge(instrumentOperation).extend({
  type: z.enum(['opening_position', 'buy', 'sell']),
  quantity: positiveDecimal(8),
  unitPrice: positiveDecimal(8),
}).strict();

const incomeOperation = baseOperation.merge(instrumentOperation).extend({
  type: z.literal('income'),
  amount: positiveDecimal(2),
}).strict();

const cashOperation = baseOperation.extend({
  type: z.enum(['cash_contribution', 'cash_withdrawal']),
  amount: positiveDecimal(2),
}).strict();

export const createOperationSchema = z.union([
  tradeOperation,
  incomeOperation,
  cashOperation,
]).superRefine((operation, context) => {
  if (operation.type === 'opening_position' && operation.feeAmount !== '0') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['feeAmount'],
      message: 'opening positions must include fees in their average unit price',
    });
  }
  if (operation.type === 'income' && operation.feeAmount !== '0') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['feeAmount'],
      message: 'income operations cannot have a fee amount',
    });
  }

  if (operation.type === 'cash_contribution' || operation.type === 'cash_withdrawal') {
    if (operation.feeAmount !== '0') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feeAmount'],
        message: 'cash operations cannot have a fee amount',
      });
    }
  }
});

export type CreateOperationInput = z.infer<typeof createOperationSchema>;

export function assertOperationFields(input: CreateOperationInput): void {
  if (!('quantity' in input) || !('unitPrice' in input)) {
    return;
  }

  if (!input.quantity || !input.unitPrice) {
    throw new DomainValidationError('trade operations require quantity and unitPrice');
  }
}
