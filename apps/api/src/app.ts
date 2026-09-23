import Fastify, { type FastifyInstance } from 'fastify';
import { optionalApiBearerToken, requireApiBearerToken, validateBearerToken } from './lib/api-auth.js';
import {
  isTursoAuthTokenExpired,
  isTursoTokenExpiryError,
  tursoTokenExpiredResponse,
} from './lib/turso-auth.js';
import { alexaRoutes } from './routes/alexa.js';
import { instrumentRoutes } from './routes/instruments.js';
import { operationRoutes } from './routes/operations.js';
import { profileRoutes } from './routes/profiles.js';

export function buildApp(options: {
  readonly apiBearerToken?: string;
  readonly alexaApiToken?: string;
  readonly tursoAuthToken?: string;
} = {}): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const apiBearerToken = requireApiBearerToken(options.apiBearerToken ?? process.env.API_BEARER_TOKEN);
  const alexaApiToken = optionalApiBearerToken(options.alexaApiToken ?? process.env.ALEXA_API_TOKEN, 'ALEXA_API_TOKEN')
    ?? apiBearerToken;
  const tursoAuthToken = options.tursoAuthToken ?? process.env.TURSO_AUTH_TOKEN;

  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode < 400) return;
    app.log.warn({
      event: 'api_request_failed',
      requestId: request.id,
      method: request.method,
      route: requestRoute(request),
      statusCode: reply.statusCode,
    }, 'API request failed');
  });

  app.setErrorHandler((error, request, reply) => {
    if (isTursoTokenExpiryError(error)) {
      logError(app, request, 'turso_auth_token_expired', 503, error);
      return reply.code(503).send(tursoTokenExpiredResponse);
    }

    if (hasClientStatusCode(error)) return reply.send(error);

    logError(app, request, 'api_unhandled_error', 500, error);
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
  });

  app.get('/health', async () => ({ status: 'ok' }));
  app.register(async (protectedApi) => {
    protectedApi.addHook('onRequest', async (request, reply) => {
      const expectedToken = isAlexaReadRoute(request) ? alexaApiToken : apiBearerToken;
      const validation = validateBearerToken(request, expectedToken);
      if (validation.valid) return;
      request.log.warn({
        event: 'api_auth_failed',
        requestId: request.id,
        method: request.method,
        route: requestRoute(request),
        reason: validation.reason,
        credentialSource: validation.credentialSource,
        expectedTokenLength: expectedToken.length,
        providedTokenLength: validation.providedTokenLength,
      }, 'API authentication failed');
      return reply
        .header('WWW-Authenticate', 'Bearer')
        .code(401)
        .send({ error: 'UNAUTHORIZED', message: 'A valid bearer token is required' });
    });

    protectedApi.addHook('onRequest', async (request, reply) => {
      if (!isTursoAuthTokenExpired(tursoAuthToken)) return;
      logError(app, request, 'turso_auth_token_expired', 503);
      return reply.code(503).send(tursoTokenExpiredResponse);
    });

    protectedApi.register(profileRoutes);
    protectedApi.register(instrumentRoutes);
    protectedApi.register(operationRoutes);
    protectedApi.register(alexaRoutes);
  }, { prefix: '/v1' });

  return app;
}

function isAlexaReadRoute(request: { readonly method: string; readonly url: string }): boolean {
  return request.method === 'GET' && request.url.startsWith('/v1/alexa/');
}

function hasClientStatusCode(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    && error.statusCode >= 400
    && error.statusCode < 500;
}

function logError(
  app: FastifyInstance,
  request: { readonly id: string; readonly method: string; readonly routeOptions: { readonly url?: string }; readonly url: string },
  event: string,
  statusCode: number,
  error?: unknown,
): void {
  const details = errorDetails(error);
  app.log.error({
    event,
    requestId: request.id,
    method: request.method,
    route: requestRoute(request),
    statusCode,
    ...details,
  }, 'API error');
}

function requestRoute(request: { readonly routeOptions: { readonly url?: string }; readonly url: string }): string {
  return request.routeOptions.url || request.url.split('?')[0];
}

function errorDetails(error: unknown): { readonly errorName?: string; readonly errorCode?: string | number } {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as { name?: unknown; code?: unknown };
  return {
    ...(typeof candidate.name === 'string' ? { errorName: candidate.name } : {}),
    ...(typeof candidate.code === 'string' || typeof candidate.code === 'number' ? { errorCode: candidate.code } : {}),
  };
}
