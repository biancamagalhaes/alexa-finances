'use strict';

const DEFAULT_DATA_STORE_ENDPOINT = 'https://api.amazonalexa.com';
const DEFAULT_LWA_TOKEN_ENDPOINT = 'https://api.amazon.com/auth/O2/token';
const DATA_STORE_NAMESPACE = 'portfolio';
const DATA_STORE_KEY = 'summary';
const VALID_PROFILES = new Set(['bianca', 'sergio', 'family']);

function required(env, name) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} must be configured when ALEXA_DATA_STORE_MODE=live`);
  }

  return value;
}

function parseDeviceIds(value) {
  const deviceIds = (value ?? '')
    .split(',')
    .map((deviceId) => deviceId.trim())
    .filter(Boolean);

  if (deviceIds.length === 0) {
    throw new Error('ALEXA_DATA_STORE_DEVICE_IDS must include at least one device ID');
  }

  if (deviceIds.length > 20) {
    throw new Error('ALEXA_DATA_STORE_DEVICE_IDS supports at most 20 device IDs');
  }

  return deviceIds;
}

function createTarget(env, mode) {
  const type = (env.ALEXA_DATA_STORE_TARGET_TYPE ?? 'DEVICES').toUpperCase();

  if (type === 'USER') {
    return { type: 'USER', id: required(env, 'ALEXA_DATA_STORE_USER_ID') };
  }

  if (type === 'DEVICES') {
    if (mode === 'live') {
      return { type: 'DEVICES', items: parseDeviceIds(env.ALEXA_DATA_STORE_DEVICE_IDS) };
    }

    const configuredIds = (env.ALEXA_DATA_STORE_DEVICE_IDS ?? '')
      .split(',')
      .map((deviceId) => deviceId.trim())
      .filter(Boolean);

    return { type: 'DEVICES', items: configuredIds };
  }

  throw new Error('ALEXA_DATA_STORE_TARGET_TYPE must be DEVICES or USER');
}

function getPublisherConfig(env = process.env) {
  const mode = env.ALEXA_DATA_STORE_MODE ?? 'dry-run';

  if (mode !== 'dry-run' && mode !== 'live') {
    throw new Error('ALEXA_DATA_STORE_MODE must be dry-run or live');
  }

  const config = {
    mode,
    dataStoreEndpoint: env.ALEXA_DATA_STORE_ENDPOINT ?? DEFAULT_DATA_STORE_ENDPOINT,
    lwaTokenEndpoint: env.LWA_TOKEN_ENDPOINT ?? DEFAULT_LWA_TOKEN_ENDPOINT,
    target: createTarget(env, mode),
    attemptDeliveryMinutes: Number.parseInt(env.ALEXA_DATA_STORE_ATTEMPT_DELIVERY_MINUTES ?? '60', 10)
  };

  if (!Number.isInteger(config.attemptDeliveryMinutes)
    || config.attemptDeliveryMinutes < 0
    || config.attemptDeliveryMinutes > 2880) {
    throw new Error('ALEXA_DATA_STORE_ATTEMPT_DELIVERY_MINUTES must be an integer from 0 to 2880');
  }

  if (mode === 'live') {
    config.lwaClientId = required(env, 'LWA_CLIENT_ID');
    config.lwaClientSecret = required(env, 'LWA_CLIENT_SECRET');
  }

  return config;
}

function assertPortfolioView(portfolio) {
  if (!portfolio || typeof portfolio !== 'object') {
    throw new Error('portfolio must be an object');
  }

  if (!VALID_PROFILES.has(portfolio.profile?.id)) {
    throw new Error('portfolio.profile.id must be bianca, sergio, or family');
  }

  if (portfolio.profile.id === 'family' && portfolio.profile.label !== 'Família') {
    throw new Error('family must use the visible label Família');
  }
}

function buildPublishRequest(portfolio, config, now = new Date()) {
  assertPortfolioView(portfolio);

  const request = {
    commands: [{
      type: 'PUT_OBJECT',
      namespace: DATA_STORE_NAMESPACE,
      key: DATA_STORE_KEY,
      content: portfolio
    }],
    target: config.target
  };

  if (config.attemptDeliveryMinutes > 0) {
    request.attemptDeliveryUntil = new Date(
      now.getTime() + (config.attemptDeliveryMinutes * 60 * 1000)
    ).toISOString();
  }

  return request;
}

async function getAccessToken(config, fetchImpl) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.lwaClientId,
    client_secret: config.lwaClientSecret,
    scope: 'alexa::datastore'
  });
  const response = await fetchImpl(config.lwaTokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`LWA token request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('LWA token response did not include an access token');
  }

  return payload.access_token;
}

async function publishPortfolioView(portfolio, options = {}) {
  const env = options.env ?? process.env;
  const config = getPublisherConfig(env);
  const request = buildPublishRequest(portfolio, config, options.now ?? new Date());

  // Dry-run is the default. It is safe for local development and all tests:
  // no token exchange or Data Store request is made in this mode.
  if (config.mode === 'dry-run') {
    return { mode: 'dry-run', request };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for live publishing');
  }

  const accessToken = await getAccessToken(config, fetchImpl);
  const response = await fetchImpl(`${config.dataStoreEndpoint}/v1/datastore/commands`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Alexa Data Store publish failed with HTTP ${response.status}`);
  }

  return { mode: 'live', request, response: await response.json() };
}

module.exports = {
  DATA_STORE_KEY,
  DATA_STORE_NAMESPACE,
  buildPublishRequest,
  getPublisherConfig,
  publishPortfolioView
};
