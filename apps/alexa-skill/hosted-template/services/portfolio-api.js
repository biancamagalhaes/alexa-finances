'use strict';

const { request: httpsRequest } = require('node:https');

const portfolioApiBaseUrl = 'https://alexa-finances.discloud.app';
const configurationItemId = 'portfolio-api-config';
let cachedApiToken;

async function getApiToken() {
  if (cachedApiToken) return cachedApiToken;

  const tableName = process.env.DYNAMODB_PERSISTENCE_TABLE_NAME;
  const region = process.env.DYNAMODB_PERSISTENCE_REGION;
  if (!tableName || !region) {
    throw new Error('Alexa-hosted DynamoDB configuration is unavailable');
  }

  // aws-sdk is available in the Alexa-hosted Node.js runtime.
  const AWS = require('aws-sdk');
  const client = new AWS.DynamoDB.DocumentClient({ region });
  const result = await client.get({
    TableName: tableName,
    Key: { id: configurationItemId },
    ConsistentRead: true,
  }).promise();
  const token = result.Item?.apiToken;

  if (typeof token !== 'string' || token.trim().length < 32) {
    throw new Error('The Alexa portfolio API token is unavailable');
  }

  cachedApiToken = token.trim();
  return cachedApiToken;
}

async function request(path) {
  const apiToken = await getApiToken();
  const targetUrl = new URL(path, portfolioApiBaseUrl);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-API-Key': apiToken,
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Portfolio API request failed with ${response.statusCode ?? 0}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Portfolio API returned invalid JSON'));
        }
      });
    });

    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('Portfolio API request timed out')));
    request.end();
  });
}

exports.portfolioApi = {
  getView(profile) {
    return request(`/v1/alexa/portfolio-view?profile=${profile}`);
  },
  getVoiceStatus(profile) {
    return request(`/v1/alexa/voice-status?profile=${profile}`);
  },
};
