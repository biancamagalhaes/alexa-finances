import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateMonthlyResult,
  calculatePortfolio,
  moneyFromDecimal,
  moneyToDecimal,
  quantityFromDecimal,
} from '../src/index.js';

const petr4 = { id: 'PETR4', symbol: 'PETR4', type: 'stock' } as const;
const mxrf11 = { id: 'MXRF11', symbol: 'MXRF11', type: 'fii' } as const;
const money = moneyFromDecimal;
const quantity = quantityFromDecimal;

test('uses exact cents and supports an initial position plus a buy', () => {
  const portfolio = calculatePortfolio({
    profileId: 'bianca',
    initialPositions: [{ profileId: 'bianca', asset: petr4, quantity: quantity('10'), averageCostCents: money('30.00') }],
    operations: [{
      id: 'buy-1', profileId: 'bianca', occurredOn: '2026-09-02', kind: 'purchase',
      asset: petr4, quantity: quantity('5'), unitPriceCents: money('32.00'), feeCents: money('1.00'),
    }],
    pricesCentsByAssetId: { PETR4: money('33.00') },
  });

  assert.equal(moneyToDecimal(portfolio.totals.openCostBasisCents), '461.00');
  assert.equal(moneyToDecimal(portfolio.totals.marketValueCents), '495.00');
  assert.equal(moneyToDecimal(portfolio.totals.unrealizedResultCents), '34.00');
  assert.equal(moneyToDecimal(portfolio.positions[0]!.averageCostCents), '30.73');
});

test('handles a partial sale using weighted-average cost and retains the exact remaining basis', () => {
  const portfolio = calculatePortfolio({
    profileId: 'bianca',
    initialPositions: [{ profileId: 'bianca', asset: petr4, quantity: quantity('10'), averageCostCents: money('30.00') }],
    operations: [{
      id: 'sell-1', profileId: 'bianca', occurredOn: '2026-09-10', kind: 'sale',
      assetId: 'PETR4', quantity: quantity('4'), unitPriceCents: money('35.00'), feeCents: money('1.00'),
    }],
    pricesCentsByAssetId: { PETR4: money('34.00') },
  });

  assert.equal(moneyToDecimal(portfolio.positions[0]!.costBasisCents), '180.00');
  assert.equal(moneyToDecimal(portfolio.totals.realizedResultCents), '19.00');
  assert.equal(moneyToDecimal(portfolio.totals.marketValueCents), '204.00');
});

test('monthly result excludes a contribution and counts a provent once', () => {
  const result = calculateMonthlyResult({
    profileId: 'bianca',
    month: '2026-09',
    initialPositions: [{ profileId: 'bianca', asset: mxrf11, quantity: quantity('100'), averageCostCents: money('10.00') }],
    operations: [
      { id: 'contribution', profileId: 'bianca', occurredOn: '2026-09-02', kind: 'contribution', amountCents: money('500.00') },
      { id: 'income', profileId: 'bianca', occurredOn: '2026-09-10', kind: 'provent', assetId: 'MXRF11', amountCents: money('12.00') },
    ],
    startPricesCentsByAssetId: { MXRF11: money('10.00') },
    endPricesCentsByAssetId: { MXRF11: money('10.20') },
  });

  assert.equal(moneyToDecimal(result.contributionsCents), '500.00');
  assert.equal(moneyToDecimal(result.proventsCents), '12.00');
  assert.equal(moneyToDecimal(result.resultCents), '32.00');
});

test('keeps an uninvested contribution as cash and includes it in patrimônio', () => {
  const portfolio = calculatePortfolio({
    profileId: 'bianca',
    initialPositions: [],
    operations: [{
      id: 'contribution', profileId: 'bianca', occurredOn: '2026-09-02', kind: 'contribution', amountCents: money('500.00'),
    }],
    pricesCentsByAssetId: {},
  });

  assert.equal(moneyToDecimal(portfolio.totals.marketValueCents), '0.00');
  assert.equal(moneyToDecimal(portfolio.totals.cashBalanceCents), '500.00');
  assert.equal(moneyToDecimal(portfolio.totals.patrimonyCents), '500.00');
});

test('holds provents as cash, includes them in patrimônio, and counts them once in monthly result', () => {
  const input = {
    profileId: 'bianca' as const,
    month: '2026-09',
    initialPositions: [{ profileId: 'bianca' as const, asset: mxrf11, quantity: quantity('100'), averageCostCents: money('10.00') }],
    operations: [{
      id: 'income', profileId: 'bianca' as const, occurredOn: '2026-09-10', kind: 'provent' as const, assetId: 'MXRF11', amountCents: money('12.00'),
    }],
    startPricesCentsByAssetId: { MXRF11: money('10.00') },
    endPricesCentsByAssetId: { MXRF11: money('10.00') },
  };
  const portfolio = calculatePortfolio({
    profileId: input.profileId,
    initialPositions: input.initialPositions,
    operations: input.operations,
    pricesCentsByAssetId: input.endPricesCentsByAssetId,
  });
  const result = calculateMonthlyResult(input);

  assert.equal(moneyToDecimal(portfolio.totals.cashBalanceCents), '12.00');
  assert.equal(moneyToDecimal(portfolio.totals.patrimonyCents), '1012.00');
  assert.equal(moneyToDecimal(result.closingPatrimonyCents), '1012.00');
  assert.equal(moneyToDecimal(result.resultCents), '12.00');
});

test('monthly result includes realised sale profit and does not double-count it', () => {
  const result = calculateMonthlyResult({
    profileId: 'bianca',
    month: '2026-09',
    initialPositions: [{ profileId: 'bianca', asset: petr4, quantity: quantity('10'), averageCostCents: money('30.00') }],
    operations: [{
      id: 'sell-all', profileId: 'bianca', occurredOn: '2026-09-15', kind: 'sale',
      assetId: 'PETR4', quantity: quantity('10'), unitPriceCents: money('35.00'),
    }],
    startPricesCentsByAssetId: { PETR4: money('30.00') },
    endPricesCentsByAssetId: { PETR4: money('35.00') },
  });

  assert.equal(moneyToDecimal(result.saleProceedsCents), '350.00');
  assert.equal(moneyToDecimal(result.resultCents), '50.00');
});

test('family is the calculated sum of Bianca and Sergio only', () => {
  const portfolio = calculatePortfolio({
    profileId: 'family',
    initialPositions: [
      { profileId: 'bianca', asset: petr4, quantity: quantity('1'), averageCostCents: money('30.00') },
      { profileId: 'sergio', asset: mxrf11, quantity: quantity('10'), averageCostCents: money('10.00') },
    ],
    operations: [{
      id: 'sergio-income', profileId: 'sergio', occurredOn: '2026-09-10', kind: 'provent', amountCents: money('5.00'),
    }],
    pricesCentsByAssetId: { PETR4: money('35.00'), MXRF11: money('11.00') },
  });

  assert.equal(portfolio.positions.length, 2);
  assert.equal(moneyToDecimal(portfolio.totals.marketValueCents), '145.00');
  assert.equal(moneyToDecimal(portfolio.totals.proventsCents), '5.00');
});

test('rejects a sale larger than the position', () => {
  assert.throws(() => calculatePortfolio({
    profileId: 'bianca',
    initialPositions: [],
    operations: [{
      id: 'invalid-sale', profileId: 'bianca', occurredOn: '2026-09-10', kind: 'sale',
      assetId: 'PETR4', quantity: quantity('1'), unitPriceCents: money('30.00'),
    }],
    pricesCentsByAssetId: {},
  }), /insufficient position/);
});
