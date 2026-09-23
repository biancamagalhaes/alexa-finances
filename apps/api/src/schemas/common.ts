import { z } from 'zod';

const decimalPattern = /^\d+(?:\.\d+)?$/;

export const positiveDecimal = (maximumFractionDigits: number) => z.string()
  .regex(decimalPattern, 'must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'must be greater than zero')
  .refine(
    (value) => value.replace('.', '').length <= 24,
    'must have at most 24 total digits',
  )
  .refine(
    (value) => (value.split('.')[1]?.length ?? 0) <= maximumFractionDigits,
    `must have at most ${maximumFractionDigits} decimal places`,
  );

export const nonNegativeDecimal = (maximumFractionDigits: number) => z.string()
  .regex(/^\d+(?:\.\d+)?$/, 'must be a non-negative decimal string')
  .refine(
    (value) => value.replace('.', '').length <= 24,
    'must have at most 24 total digits',
  )
  .refine(
    (value) => (value.split('.')[1]?.length ?? 0) <= maximumFractionDigits,
    `must have at most ${maximumFractionDigits} decimal places`,
  );

export const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'must be a valid date');
