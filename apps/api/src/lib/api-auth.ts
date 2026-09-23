import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

const minimumTokenLength = 32;

export type BearerTokenValidation =
  | { readonly valid: true }
  | {
    readonly valid: false;
    readonly reason: 'missing_or_malformed' | 'token_length_mismatch' | 'token_mismatch';
    readonly providedTokenLength?: number;
  };

export function requireApiBearerToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token || token.length < minimumTokenLength) {
    throw new Error(`API_BEARER_TOKEN must contain at least ${minimumTokenLength} characters`);
  }
  return token;
}

export function hasValidBearerToken(request: FastifyRequest, expectedToken: string): boolean {
  return validateBearerToken(request, expectedToken).valid;
}

export function validateBearerToken(request: FastifyRequest, expectedToken: string): BearerTokenValidation {
  return validateBearerHeader(request.headers.authorization, expectedToken);
}

export function validateBearerHeader(header: string | undefined, expectedToken: string): BearerTokenValidation {
  const providedToken = parseBearerToken(header);
  if (!providedToken) return { valid: false, reason: 'missing_or_malformed' };

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length) {
    return { valid: false, reason: 'token_length_mismatch', providedTokenLength: provided.length };
  }
  return timingSafeEqual(provided, expected)
    ? { valid: true }
    : { valid: false, reason: 'token_mismatch', providedTokenLength: provided.length };
}

function parseBearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer +([^\s]+)$/i.exec(header ?? '');
  return match?.[1];
}
