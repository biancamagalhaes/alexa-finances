import { describe, expect, it } from 'vitest';
import { buildPortfolioContract, type StoredOperation, type StoredPriceQuote } from '../src/services/portfolio-contract.js';

const decimal = (value: string) => ({ toString: () => value });
const petr4 = { id: 'petr4-id', symbol: 'PETR4', type: 'STOCK' };
const hglg11 = { id: 'hglg11-id', symbol: 'HGLG11', type: 'FII' };

function operation(overrides: Partial<StoredOperation> & Pick<StoredOperation, 'id' | 'type' | 'profile' | 'occurredOn'>): StoredOperation {
  const { id, type, profile, occurredOn, ...optionalFields } = overrides;
  return {
    id,
    type,
    profile,
    occurredOn,
    instrument: null,
    quantity: null,
    unitPrice: null,
    amount: null,
    feeAmount: decimal('0'),
    ...optionalFields,
  };
}

const operations: StoredOperation[] = [
  operation({
    id: 'bianca-opening', type: 'OPENING_POSITION', profile: { slug: 'BIANCA' }, occurredOn: '2026-08-20',
    instrument: petr4, quantity: decimal('10'), unitPrice: decimal('10.00'),
  }),
  operation({
    id: 'bianca-contribution', type: 'CASH_CONTRIBUTION', profile: { slug: 'BIANCA' }, occurredOn: '2026-09-01', amount: decimal('100.00'),
  }),
  operation({
    id: 'sergio-opening', type: 'OPENING_POSITION', profile: { slug: 'SERGIO' }, occurredOn: '2026-08-20',
    instrument: hglg11, quantity: decimal('5'), unitPrice: decimal('100.00'),
  }),
  operation({
    id: 'sergio-contribution', type: 'CASH_CONTRIBUTION', profile: { slug: 'SERGIO' }, occurredOn: '2026-09-01', amount: decimal('500.00'),
  }),
  operation({
    id: 'sergio-income', type: 'INCOME', profile: { slug: 'SERGIO' }, occurredOn: '2026-09-10', instrument: hglg11, amount: decimal('20.00'),
  }),
];

const quotes: StoredPriceQuote[] = [
  { instrumentId: petr4.id, closingOn: '2026-08-31', fetchedAt: '2026-08-31T21:00:00Z', price: decimal('10.00'), isValid: true },
  { instrumentId: petr4.id, closingOn: '2026-09-22', fetchedAt: '2026-09-22T21:00:00Z', price: decimal('12.00'), isValid: true },
  { instrumentId: hglg11.id, closingOn: '2026-08-31', fetchedAt: '2026-08-31T21:00:00Z', price: decimal('100.00'), isValid: true },
  { instrumentId: hglg11.id, closingOn: '2026-09-22', fetchedAt: '2026-09-22T21:00:00Z', price: decimal('110.00'), isValid: true },
];

describe('buildPortfolioContract', () => {
  it('aggregates Bianca and Sergio only when family is requested', () => {
    const bianca = buildPortfolioContract({ profile: 'bianca', operations, quotes, asOf: '2026-09-22' });
    const family = buildPortfolioContract({ profile: 'family', operations, quotes, asOf: '2026-09-22' });

    expect(bianca).toMatchObject({ kind: 'ready' });
    expect(family).toMatchObject({ kind: 'ready' });
    if (bianca.kind !== 'ready' || family.kind !== 'ready') return;

    expect(bianca.view.profile.label).toBe('Bianca');
    expect(bianca.view.summary.patrimony).toBe('R$ 220,00');
    expect(bianca.view.summary.monthlyResult).toBe('+R$ 20,00');
    expect(family.view.profile.label).toBe('Família');
    expect(family.view.summary.patrimony).toBe('R$ 1.290,00');
    expect(family.view.summary.income).toBe('R$ 20,00');
  });

  it('always supplies masked variants while keeping numeric data out of voice status', () => {
    const result = buildPortfolioContract({ profile: 'sergio', operations, quotes, asOf: '2026-09-22' });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;

    expect(result.view.summary).toMatchObject({
      maskedPatrimony: '••••••',
      maskedMonthlyResult: '••••••',
      maskedContributions: '••••••',
      maskedIncome: '••••••',
    });
    expect(result.view.positions[0]?.maskedValue).toBe('••••••');
    expect(Object.keys(result.voice).sort()).toEqual(['hasIncomeThisMonth', 'largestAllocationLabel', 'resultState', 'updated']);
    expect(JSON.stringify(result.voice)).not.toMatch(/[0-9]|R\$|%|2026/);
    expect(result.voice).toEqual({
      resultState: 'positive',
      hasIncomeThisMonth: true,
      largestAllocationLabel: 'fiis',
      updated: true,
    });
  });

  it('uses the latest valid quote and refuses to value an open position without one', () => {
    const newerQuote = { instrumentId: petr4.id, closingOn: '2026-09-22', fetchedAt: '2026-09-22T22:00:00Z', price: decimal('13.00'), isValid: true };
    const fresh = buildPortfolioContract({ profile: 'bianca', operations, quotes: [...quotes, newerQuote], asOf: '2026-09-22' });
    expect(fresh.kind).toBe('ready');
    if (fresh.kind === 'ready') expect(fresh.view.summary.patrimony).toBe('R$ 230,00');

    const unavailable = buildPortfolioContract({
      profile: 'bianca',
      operations,
      quotes: quotes.map((quote) => quote.instrumentId === petr4.id ? { ...quote, isValid: false } : quote),
      asOf: '2026-09-22',
    });
    expect(unavailable).toEqual({ kind: 'price_unavailable', message: expect.any(String) });
  });

  it('converts sub-cent source prices deterministically without JavaScript number math', () => {
    const fractionalQuote = { instrumentId: petr4.id, closingOn: '2026-09-22', fetchedAt: '2026-09-22T22:00:00Z', price: decimal('12.00500000'), isValid: true };
    const result = buildPortfolioContract({ profile: 'bianca', operations, quotes: [...quotes, fractionalQuote], asOf: '2026-09-22' });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') expect(result.view.summary.patrimony).toBe('R$ 220,10');
  });
});
