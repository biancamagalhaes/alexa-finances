import { describe, expect, it } from 'vitest';
import { createOperationSchema } from '../src/schemas/operation.js';

const base = {
  profileSlug: 'bianca',
  occurredOn: '2026-09-22',
  idempotencyKey: 'operation-001',
};

describe('createOperationSchema', () => {
  it('accepts an opening position with decimal strings', () => {
    const result = createOperationSchema.safeParse({
      ...base,
      type: 'opening_position',
      instrumentId: '8eac2a56-306a-43d2-89de-b8dc70f5aacf',
      quantity: '10.00000000',
      unitPrice: '32.50',
      feeAmount: '0',
    });

    expect(result.success).toBe(true);
  });

  it('requires an amount for an income operation', () => {
    const result = createOperationSchema.safeParse({
      ...base,
      type: 'income',
      instrumentId: '8eac2a56-306a-43d2-89de-b8dc70f5aacf',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a fee on cash contribution', () => {
    const result = createOperationSchema.safeParse({
      ...base,
      type: 'cash_contribution',
      amount: '500.00',
      feeAmount: '1.00',
    });

    expect(result.success).toBe(false);
  });

  it('rejects JavaScript money numbers', () => {
    const result = createOperationSchema.safeParse({
      ...base,
      type: 'cash_contribution',
      amount: 500,
    });

    expect(result.success).toBe(false);
  });
});
