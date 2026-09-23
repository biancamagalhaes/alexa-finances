import { PrismaClient } from '@prisma/client';

export async function removeDemoData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.portfolioDailySnapshot.deleteMany({ where: { isDemo: true } });
    await transaction.marketIngestionRun.deleteMany({ where: { isDemo: true } });
    await transaction.operation.deleteMany({ where: { isDemo: true } });
    await transaction.priceQuote.deleteMany({ where: { isDemo: true } });
    await transaction.priceQuote.deleteMany({ where: { instrument: { isDemo: true } } });
    await transaction.instrument.deleteMany({ where: { isDemo: true } });
  });
}
