import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrapiQuoteProvider,
  MarketDataError,
  MarketIngestionWorker,
  type EodQuote,
  type IngestionRunRecord,
  type MarketPriceRepository,
  type QuoteProvider,
  TesouroDiretoOfficialQuoteProvider,
  withRetry,
} from '../src/index.js';

const instruments = [
  { id: 'petr4-id', symbol: 'PETR4', type: 'stock' as const },
  { id: 'mxrf11-id', symbol: 'MXRF11', type: 'fii' as const },
  { id: 'ipca2035-id', symbol: 'TESOURO-IPCA-2035', type: 'treasury' as const },
];

class InMemoryRepository implements MarketPriceRepository {
  readonly quotes: EodQuote[] = [];
  readonly runs: IngestionRunRecord[] = [];

  async listTrackedInstruments() { return instruments; }
  async upsertEodQuote(quote: EodQuote) {
    const existing = this.quotes.find((item) => item.instrumentId === quote.instrumentId && item.quotedOn === quote.quotedOn && item.source.provider === quote.source.provider);
    if (!existing) { this.quotes.push(quote); return 'inserted' as const; }
    if (existing.closingPrice === quote.closingPrice) return 'unchanged' as const;
    Object.assign(existing, quote);
    return 'updated' as const;
  }
  async recordIngestionRun(run: IngestionRunRecord) { this.runs.push(run); }
}

function fixtureProvider(name: QuoteProvider['name'], quotes: readonly { symbol: string; closingPrice: string; quotedOn: string; publishedOn: string }[]): QuoteProvider {
  return { name, fetchEodQuotes: async () => quotes };
}

test('imports B3 and Tesouro fixtures, attaching provider provenance', async () => {
  const repository = new InMemoryRepository();
  const worker = new MarketIngestionWorker({
    repository,
    b3Provider: fixtureProvider('brapi', [
      { symbol: 'PETR4', closingPrice: '32.5', quotedOn: '2026-09-22', publishedOn: '2026-09-22' },
      { symbol: 'MXRF11', closingPrice: '10.15', quotedOn: '2026-09-22', publishedOn: '2026-09-22' },
    ]),
    treasuryProvider: fixtureProvider('tesouro-direto-official', [
      { symbol: 'TESOURO-IPCA-2035', closingPrice: '2187.99', quotedOn: '2026-09-22', publishedOn: '2026-09-22' },
    ]),
    now: () => new Date('2026-09-22T21:15:00.000Z'),
  });

  const run = await worker.run('after-close', '2026-09-22');

  assert.equal(run.status, 'succeeded');
  assert.equal(run.inserted, 3);
  assert.equal(repository.quotes[0]?.closingPrice, '32.50');
  assert.equal(repository.quotes[2]?.source.provider, 'tesouro-direto-official');
  assert.equal(repository.quotes[0]?.source.endpoint, 'injected-fixture');
});

test('retries transient provider failures and remains idempotent on a repeated run', async () => {
  const repository = new InMemoryRepository();
  let calls = 0;
  const b3Provider: QuoteProvider = {
    name: 'brapi',
    async fetchEodQuotes() {
      calls += 1;
      if (calls === 1) throw new MarketDataError('temporary upstream error', true);
      return [{ symbol: 'PETR4', closingPrice: '32.50', quotedOn: '2026-09-22', publishedOn: '2026-09-22' }];
    },
  };
  const worker = new MarketIngestionWorker({
    repository, b3Provider,
    treasuryProvider: fixtureProvider('tesouro-direto-official', []),
    retryPolicy: { attempts: 2, delayMs: 0 }, sleep: async () => undefined,
  });

  const first = await worker.run('after-close', '2026-09-22');
  const second = await worker.run('after-close', '2026-09-22');

  assert.equal(calls, 3);
  assert.equal(first.inserted, 1);
  assert.equal(second.unchanged, 1);
  assert.equal(repository.quotes.length, 1);
});

test('records a source failure and preserves the previously valid quote', async () => {
  const repository = new InMemoryRepository();
  await repository.upsertEodQuote({
    instrumentId: 'petr4-id', symbol: 'PETR4', type: 'stock', closingPrice: '31.00', quotedOn: '2026-09-19',
    source: { provider: 'brapi', endpoint: 'https://brapi.dev/api/quote', retrievedAt: '2026-09-19T21:00:00.000Z', publishedOn: '2026-09-19' },
  });
  const worker = new MarketIngestionWorker({
    repository,
    b3Provider: { name: 'brapi', fetchEodQuotes: async () => { throw new MarketDataError('unavailable', true); } },
    treasuryProvider: fixtureProvider('tesouro-direto-official', []),
    retryPolicy: { attempts: 1, delayMs: 0 },
  });

  const run = await worker.run('after-close', '2026-09-22');
  assert.equal(run.status, 'failed');
  assert.equal(run.failures[0]?.provider, 'brapi');
  assert.equal(repository.quotes.length, 1);
  assert.equal(repository.quotes[0]?.closingPrice, '31.00');
});

test('adapts Brapi quotes with an authorization header and validates HTTPS endpoint templates', async () => {
  let requestHeaders: Readonly<Record<string, string>> | undefined;
  const brapi = new BrapiQuoteProvider('brapi-test-key', {
    fetch: async (_url, init) => {
      requestHeaders = init?.headers;
      return { ok: true, status: 200, json: async () => ({
        results: [{ symbol: 'PETR4', regularMarketPrice: 32.5, regularMarketTime: '2026-09-22T21:00:00.000Z' }],
      }) };
    },
  });
  const brapiQuotes = await brapi.fetchEodQuotes({ instruments: [instruments[0]!], quotedOn: '2026-09-22' });
  assert.deepEqual(brapiQuotes, [{ symbol: 'PETR4', closingPrice: '32.50', quotedOn: '2026-09-22', publishedOn: '2026-09-22' }]);
  assert.deepEqual(requestHeaders, { Authorization: 'Bearer brapi-test-key' });

  const provider = new TesouroDiretoOfficialQuoteProvider(
    { urlTemplate: 'https://approved.example/quotes?date={date}&symbols={symbols}' },
    { fetch: async () => ({ ok: true, status: 200, json: async () => ({ quotes: [{ symbol: 'TESOURO-IPCA-2035', closingPrice: 2187.99, quotedOn: '2026-09-22' }] }) }) },
  );
  const quotes = await provider.fetchEodQuotes({ instruments: [instruments[2]!], quotedOn: '2026-09-22' });
  assert.deepEqual(quotes, [{ symbol: 'TESOURO-IPCA-2035', closingPrice: '2187.99', quotedOn: '2026-09-22', publishedOn: '2026-09-22' }]);
});

test('does not retry permanent errors', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw new MarketDataError('bad payload', false); }, { attempts: 3, delayMs: 0 }),
    /bad payload/,
  );
  assert.equal(calls, 1);
});
