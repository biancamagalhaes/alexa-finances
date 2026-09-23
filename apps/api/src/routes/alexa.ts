import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@alexa-finances/database';
import {
  alexaProfiles,
  buildPortfolioContract,
  type AlexaProfile,
} from '../services/portfolio-contract.js';

export const alexaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/alexa/portfolio-view', async (request, reply) => {
    const profile = parseProfile((request.query as { profile?: string }).profile, reply);
    if (!profile) return;
    const result = await portfolioContract(profile);
    if (result.kind === 'price_unavailable') {
      return reply.code(424).send({ error: 'PRICE_UNAVAILABLE', message: result.message });
    }
    return result.view;
  });

  app.get('/alexa/voice-status', async (request, reply) => {
    const profile = parseProfile((request.query as { profile?: string }).profile, reply);
    if (!profile) return;
    const result = await portfolioContract(profile);
    if (result.kind === 'price_unavailable') {
      // This endpoint deliberately keeps the response qualitative: no values,
      // prices, quantities, percentages, or dates are emitted to voice clients.
      return reply.code(424).send({ error: 'PRICE_UNAVAILABLE', message: 'Portfolio data is not ready' });
    }
    return result.voice;
  });
};

async function portfolioContract(profile: AlexaProfile) {
  const operations = await prisma.operation.findMany({
    include: { profile: { select: { slug: true } }, instrument: { select: { id: true, symbol: true, type: true } } },
    orderBy: [{ occurredOn: 'asc' }, { createdAt: 'asc' }],
  });
  const instrumentIds = [...new Set(operations.flatMap((operation) => operation.instrumentId ? [operation.instrumentId] : []))];
  const quotes = instrumentIds.length === 0
    ? []
    : await prisma.priceQuote.findMany({
      where: { instrumentId: { in: instrumentIds }, isValid: true },
      orderBy: [{ quotedOn: 'desc' }, { retrievedAt: 'desc' }],
    });

  return buildPortfolioContract({
    profile,
    operations,
    quotes: quotes.map((quote) => ({
      instrumentId: quote.instrumentId,
      closingOn: quote.quotedOn,
      price: quote.price,
      fetchedAt: quote.retrievedAt,
      isValid: quote.isValid,
    })),
  });
}

function parseProfile(value: string | undefined, reply: { code(statusCode: number): { send(payload: unknown): unknown } }): AlexaProfile | undefined {
  if (value && (alexaProfiles as readonly string[]).includes(value)) return value as AlexaProfile;
  reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'profile must be bianca, sergio, or family' });
  return undefined;
}
