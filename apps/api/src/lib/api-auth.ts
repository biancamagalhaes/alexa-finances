import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

const minimumTokenLength = 32;

export function requireApiBearerToken(value: string | undefined): string {
  const token = value?.trim();
  if (!token || token.length < minimumTokenLength) {
    throw new Error(`API_BEARER_TOKEN must contain at least ${minimumTokenLength} characters`);
  }
  return token;
}

export function hasValidBearerToken(request: FastifyRequest, expectedToken: string): boolean {
  const providedToken = parseBearerToken(request.headers.authorization);
  if (!providedToken) return false;

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function parseBearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer +([^\s]+)$/i.exec(header ?? '');
  return match?.[1];
}
