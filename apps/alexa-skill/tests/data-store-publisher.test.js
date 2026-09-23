const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DATA_STORE_KEY,
  DATA_STORE_NAMESPACE,
  publishPortfolioView
} = require('../publisher/src/data-store-publisher');

const familyPortfolio = {
  profile: { id: 'family', label: 'Família' },
  asOfLabel: 'fechamento mais recente',
  resultLabel: 'resultado disponível',
  summary: {
    maskedPatrimony: '••••••',
    patrimony: 'R$ 1.234,56',
    maskedMonthlyResult: '••••••',
    monthlyResult: 'R$ 12,34',
    maskedContributions: '••••••',
    contributions: 'R$ 1.000,00',
    maskedIncome: '••••••',
    income: 'R$ 1,23'
  }
};

test('publisher defaults to dry-run and does not perform a network request', async () => {
  let requested = false;
  const result = await publishPortfolioView(familyPortfolio, {
    env: { ALEXA_DATA_STORE_DEVICE_IDS: 'amzn1.ask.device.echo-show-15' },
    fetchImpl: async () => {
      requested = true;
      throw new Error('network must not be called in dry-run');
    },
    now: new Date('2026-09-22T12:00:00.000Z')
  });

  assert.equal(result.mode, 'dry-run');
  assert.equal(requested, false);
  assert.deepEqual(result.request.target, {
    type: 'DEVICES',
    items: ['amzn1.ask.device.echo-show-15']
  });
  assert.deepEqual(result.request.commands, [{
    type: 'PUT_OBJECT',
    namespace: DATA_STORE_NAMESPACE,
    key: DATA_STORE_KEY,
    content: familyPortfolio
  }]);
});

test('publisher retains the canonical family slug and its visible label', async () => {
  await assert.rejects(
    publishPortfolioView({ ...familyPortfolio, profile: { id: 'family', label: 'Family' } }, {
      env: { ALEXA_DATA_STORE_MODE: 'dry-run' }
    }),
    /Família/
  );
});

test('live publisher uses injected fetch only and sends a scoped token request', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });

    if (requests.length === 1) {
      return { ok: true, json: async () => ({ access_token: 'test-token' }) };
    }

    return { ok: true, json: async () => ({ results: [{ type: 'SUCCESS' }] }) };
  };
  const result = await publishPortfolioView(familyPortfolio, {
    env: {
      ALEXA_DATA_STORE_MODE: 'live',
      LWA_CLIENT_ID: 'test-client',
      LWA_CLIENT_SECRET: 'test-secret',
      ALEXA_DATA_STORE_DEVICE_IDS: 'amzn1.ask.device.echo-show-15',
      ALEXA_DATA_STORE_ATTEMPT_DELIVERY_MINUTES: '0'
    },
    fetchImpl
  });

  assert.equal(result.mode, 'live');
  assert.equal(requests.length, 2);
  assert.match(requests[0].init.body, /scope=alexa%3A%3Adatastore/);
  assert.equal(requests[1].url, 'https://api.amazonalexa.com/v1/datastore/commands');
  assert.equal(requests[1].init.headers.Authorization, 'Bearer test-token');
});
