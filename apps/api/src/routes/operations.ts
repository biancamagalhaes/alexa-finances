import type { FastifyPluginAsync } from 'fastify';
import { OperationType, Prisma, ProfileSlug, prisma } from '@alexa-finances/database';
import { assertOperationFields, createOperationSchema } from '../schemas/operation.js';
import { formatZodError, isRecordNotFound, isUniqueConstraintViolation } from '../lib/errors.js';

const operationTypeMap = {
  opening_position: OperationType.OPENING_POSITION,
  buy: OperationType.BUY,
  sell: OperationType.SELL,
  income: OperationType.INCOME,
  cash_contribution: OperationType.CASH_CONTRIBUTION,
  cash_withdrawal: OperationType.CASH_WITHDRAWAL,
} as const;

const profileSlugMap = {
  bianca: ProfileSlug.BIANCA,
  sergio: ProfileSlug.SERGIO,
} as const;

export const operationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/operations', async (request, reply) => {
    const query = request.query as { profileSlug?: string };
    const requestedProfileSlug = query.profileSlug;
    const profileSlug = requestedProfileSlug === 'bianca' || requestedProfileSlug === 'sergio'
      ? requestedProfileSlug
      : undefined;
    if (requestedProfileSlug && !profileSlug) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'profileSlug must be bianca or sergio' });
    }

    const operations = await prisma.operation.findMany({
      where: profileSlug ? { profile: { slug: profileSlugMap[profileSlug] } } : undefined,
      include: { profile: true, instrument: true },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    });

    return { data: operations };
  });

  app.post('/operations', async (request, reply) => {
    const parsed = createOperationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: formatZodError(parsed.error) });
    }

    const input = parsed.data;
    assertOperationFields(input);

    const profile = await prisma.profile.findUnique({
      where: { slug: profileSlugMap[input.profileSlug] },
      select: { id: true },
    });
    if (!profile) {
      return reply.code(409).send({ error: 'PROFILE_NOT_INITIALIZED', message: 'Run the database seed before creating operations' });
    }

    const existing = await prisma.operation.findUnique({
      where: { profileId_idempotencyKey: { profileId: profile.id, idempotencyKey: input.idempotencyKey } },
      include: { profile: true, instrument: true },
    });
    if (existing) {
      return reply.code(200).send({ data: existing, idempotentReplay: true });
    }

    if ('instrumentId' in input) {
      const instrument = await prisma.instrument.findUnique({ where: { id: input.instrumentId }, select: { id: true } });
      if (!instrument) {
        return reply.code(404).send({ error: 'INSTRUMENT_NOT_FOUND', message: 'The requested instrument does not exist' });
      }
    }

    try {
      const operation = await prisma.operation.create({
        data: {
          profileId: profile.id,
          type: operationTypeMap[input.type],
          occurredOn: new Date(`${input.occurredOn}T00:00:00.000Z`),
          instrumentId: 'instrumentId' in input ? input.instrumentId : null,
          quantity: 'quantity' in input ? input.quantity : null,
          unitPrice: 'unitPrice' in input ? input.unitPrice : null,
          amount: 'amount' in input ? input.amount : null,
          feeAmount: input.feeAmount,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
        include: { profile: true, instrument: true },
      });

      return reply.code(201).send({ data: operation, idempotentReplay: false });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const replay = await prisma.operation.findUnique({
          where: { profileId_idempotencyKey: { profileId: profile.id, idempotencyKey: input.idempotencyKey } },
          include: { profile: true, instrument: true },
        });
        if (replay) {
          return reply.code(200).send({ data: replay, idempotentReplay: true });
        }
      }
      if (isRecordNotFound(error)) {
        return reply.code(404).send({ error: 'RELATED_RECORD_NOT_FOUND', message: 'A related record does not exist' });
      }
      throw error;
    }
  });
};
