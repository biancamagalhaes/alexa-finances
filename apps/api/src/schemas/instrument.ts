import { z } from 'zod';
import { isoDate } from './common.js';

const commonFields = {
  symbol: z.string().trim().min(1).max(48).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(160),
};

export const createInstrumentSchema = z.discriminatedUnion('type', [
  z.object({
    ...commonFields,
    type: z.literal('stock'),
  }),
  z.object({
    ...commonFields,
    type: z.literal('fii'),
  }),
  z.object({
    ...commonFields,
    type: z.literal('treasury'),
    treasuryType: z.string().trim().min(1).max(80),
    maturityDate: isoDate,
  }),
]);

export type CreateInstrumentInput = z.infer<typeof createInstrumentSchema>;
