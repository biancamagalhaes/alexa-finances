import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { isTursoAuthTokenExpired, isTursoTokenExpiryError } from '../src/lib/turso-auth.js';

const bearerToken = 'test-token-with-at-least-thirty-two-characters';
const expiredTursoToken = 'eyJhbGciOiJub25lIn0.eyJleHAiOjF9.signature';

describe('Turso token expiration', () => {
  it('recognizes an expired JWT without exposing its contents', () => {
    expect(isTursoAuthTokenExpired(expiredTursoToken, 1_001)).toBe(true);
    expect(isTursoAuthTokenExpired('opaque-token', 1_001)).toBe(false);
  });

  it('recognizes a provider expiry error, including a nested cause', () => {
    expect(isTursoTokenExpiryError(new Error('JWT token expired'))).toBe(true);
    expect(isTursoTokenExpiryError(new Error('request failed', { cause: new Error('token expiration reached') }))).toBe(true);
    expect(isTursoTokenExpiryError(new Error('database connection failed'))).toBe(false);
  });

  it('returns a clear 503 for authenticated API requests after the Turso token expires', async () => {
    const app = buildApp({ apiBearerToken: bearerToken, tursoAuthToken: expiredTursoToken });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/profiles',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: 'TURSO_AUTH_TOKEN_EXPIRED',
        message: 'The Turso database token has expired. Generate a new token and update TURSO_AUTH_TOKEN.',
      });
    } finally {
      await app.close();
    }
  });
});
