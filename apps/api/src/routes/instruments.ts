import type { FastifyPluginAsync } from 'fastify';
import { InstrumentType, prisma } from '@alexa-finances/database';
import { formatZodError, isUniqueConstraintViolation } from '../lib/errors.js';
import { createInstrumentSchema } from '../schemas/instrument.js';

const instrumentTypeMap = {
  stock: InstrumentType.STOCK,
  fii: InstrumentType.FII,
  treasury: InstrumentType.TREASURY,
} as const;

export const instrumentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/instruments', async () => {
    const instruments = await prisma.instrument.findMany({ orderBy: { symbol: 'asc' } });
    return { data: instruments };
  });

  app.post('/instruments', async (request, reply) => {
    const parsed = createInstrumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', message: formatZodError(parsed.error) });
    }

    const input = parsed.data;
    try {
      const instrument = await prisma.instrument.create({
        data: {
          symbol: input.symbol,
          name: input.name,
          type: instrumentTypeMap[input.type],
          treasuryType: input.type === 'treasury' ? input.treasuryType : null,
          maturityDate: input.type === 'treasury' ? new Date(`${input.maturityDate}T00:00:00.000Z`) : null,
        },
      });

      return reply.code(201).send({ data: instrument });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return reply.code(409).send({ error: 'INSTRUMENT_ALREADY_EXISTS', message: 'An instrument with this symbol already exists' });
      }
      throw error;
    }
  });
};
