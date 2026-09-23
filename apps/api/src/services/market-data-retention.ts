import { prisma } from '@alexa-finances/database';

export const MARKET_RUN_RETENTION_DAYS = 90;

export function marketRunRetentionCutoff(localDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('localDate must be YYYY-MM-DD');
  const cutoff = new Date(`${localDate}T00:00:00.000Z`);
  if (Number.isNaN(cutoff.valueOf())) throw new Error('localDate must be a valid calendar date');
  cutoff.setUTCDate(cutoff.getUTCDate() - MARKET_RUN_RETENTION_DAYS);
  return cutoff;
}

export async function purgeExpiredMarketIngestionRuns(localDate: string): Promise<number> {
  const result = await prisma.marketIngestionRun.deleteMany({
    where: { completedAt: { lt: marketRunRetentionCutoff(localDate) } },
  });
  return result.count;
}
