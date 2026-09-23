import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { requireApiBearerToken, validateBearerHeader } from '../src/lib/api-auth.js';

const bearerToken = 'test-token-with-at-least-thirty-two-characters';

describe('API bearer authentication', () => {
  it('fails closed when no token is configured', () => {
    expect(() => requireApiBearerToken(undefined)).toThrow('API_BEARER_TOKEN');
    expect(() => requireApiBearerToken('   ')).toThrow('API_BEARER_TOKEN');
    expect(() => requireApiBearerToken('short-token')).toThrow('API_BEARER_TOKEN');
  });

  it('keeps health public but rejects missing, malformed, and incorrect credentials on every sensitive route group', async () => {
    const app = buildApp({ apiBearerToken: bearerToken });
    try {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);

      for (const authorization of [undefined, 'Basic credentials', 'Bearer wrong-token']) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/operations',
          headers: authorization ? { authorization } : undefined,
          payload: {},
        });
        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
      }

      for (const url of [
        '/v1/alexa/portfolio-view?profile=bianca',
        '/v1/alexa/voice-status?profile=bianca',
      ]) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(401);
      }
    } finally {
      await app.close();
    }
  });

  it('accepts a case-insensitive bearer scheme and continues to route validation', async () => {
    const app = buildApp({ apiBearerToken: bearerToken });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/operations',
        headers: { authorization: `bearer ${bearerToken}` },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    } finally {
      await app.close();
    }
  });

  it('classifies authentication failures without retaining the token value', () => {
    const missing = validateBearerHeader(undefined, bearerToken);
    const short = validateBearerHeader('Bearer short', bearerToken);
    const incorrect = validateBearerHeader(`Bearer ${'x'.repeat(bearerToken.length)}`, bearerToken);

    expect(missing).toEqual({ valid: false, reason: 'missing_or_malformed' });
    expect(short).toEqual({ valid: false, reason: 'token_length_mismatch', providedTokenLength: 5 });
    expect(incorrect).toEqual({
      valid: false,
      reason: 'token_mismatch',
      providedTokenLength: bearerToken.length,
    });
  });
});
