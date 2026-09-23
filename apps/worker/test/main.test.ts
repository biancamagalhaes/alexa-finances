import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInvocation, toSummary, validateEnvironment } from '../src/main.js';

test('accepts only a supported run kind and calendar date', () => {
  assert.deepEqual(parseInvocation(['after-close', '2026-09-22']), {
    kind: 'after-close',
    quotedOn: '2026-09-22',
  });
  assert.throws(() => parseInvocation(['after-close', '2026-02-30']));
  assert.throws(() => parseInvocation(['hourly', '2026-09-22']));
  assert.throws(() => parseInvocation(['after-open']));
});

test('requires a SQLite database file and Brapi API key', () => {
  const environment = {
    DATABASE_URL: 'file:../../packages/database/prisma/alexa-finances.db',
    BRAPI_API_KEY: 'brapi-test-key',
    MARKET_TESOURO_EOD_URL: 'https://market.example.test/treasury?date={date}&symbols={symbols}',
  };
  assert.doesNotThrow(() => validateEnvironment(environment));
  assert.throws(() => validateEnvironment({ ...environment, BRAPI_API_KEY: '' }));
  assert.throws(() => validateEnvironment({ ...environment, MARKET_TESOURO_EOD_URL: 'http://market.example.test' }));
  assert.throws(() => validateEnvironment({ ...environment, DATABASE_URL: 'postgresql://db.example.test/portfolio' }));
});

test('accepts Turso credentials and rejects an incomplete Turso configuration', () => {
  const environment = {
    TURSO_DATABASE_URL: 'libsql://minha-carteira.turso.io',
    TURSO_AUTH_TOKEN: 'turso-test-token',
    BRAPI_API_KEY: 'brapi-test-key',
  };
  assert.doesNotThrow(() => validateEnvironment(environment));
  assert.throws(() => validateEnvironment({ ...environment, TURSO_AUTH_TOKEN: '' }));
});

test('sanitized summary does not include upstream failure messages', () => {
  const summary = toSummary({
    idempotencyKey: 'market:after-close:2026-09-22',
    kind: 'after-close',
    quotedOn: '2026-09-22',
    startedAt: '2026-09-22T18:15:00.000Z',
    completedAt: '2026-09-22T18:16:00.000Z',
    status: 'partial',
    inserted: 1,
    unchanged: 2,
    updated: 3,
    rejected: 4,
    failures: [{ provider: 'brapi', retryable: true, message: 'https://secret.example.test?token=do-not-print' }],
  });

  assert.deepEqual(summary, {
    kind: 'after-close',
    quotedOn: '2026-09-22',
    status: 'partial',
    quotes: { inserted: 1, unchanged: 2, updated: 3, rejected: 4 },
    failures: [{ provider: 'brapi', retryable: true }],
  });
  assert.doesNotMatch(JSON.stringify(summary), /secret|token/i);
});
