const tokenExpiryMessage = 'The Turso database token has expired. Generate a new token and update TURSO_AUTH_TOKEN.';

export const tursoTokenExpiredResponse = {
  error: 'TURSO_AUTH_TOKEN_EXPIRED',
  message: tokenExpiryMessage,
} as const;

export function isTursoAuthTokenExpired(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;

  const expiresAt = readJwtExpiration(token);
  return expiresAt !== undefined && expiresAt <= now;
}

export function isTursoTokenExpiryError(error: unknown): boolean {
  return collectErrorMessages(error).some((message) => /(?:token|jwt).{0,40}(?:expired|expiration)|(?:expired|expiration).{0,40}(?:token|jwt)/i.test(message));
}

function readJwtExpiration(token: string): number | undefined {
  const [, payload] = token.split('.');
  if (!payload) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp * 1_000 : undefined;
  } catch {
    return undefined;
  }
}

function collectErrorMessages(error: unknown, messages: string[] = [], visited = new Set<object>()): string[] {
  if (typeof error === 'string') return [...messages, error];
  if (typeof error !== 'object' || error === null || visited.has(error)) return messages;

  visited.add(error);
  const candidate = error as { message?: unknown; cause?: unknown };
  if (typeof candidate.message === 'string') messages.push(candidate.message);
  return collectErrorMessages(candidate.cause, messages, visited);
}
