import { InstrumentType, OperationType, ProfileSlug } from '@prisma/client';
import { createPrismaClient } from '../src/client.js';
import { removeDemoData } from './demo-data.js';

const prisma = createPrismaClient();
const demoSourceEndpoint = 'https://demo.local/market-data';

async function main(): Promise<void> {
  const [bianca, sergio] = await Promise.all([
    prisma.profile.upsert({
      where: { slug: ProfileSlug.BIANCA },
      update: { displayName: 'Bianca' },
      create: { slug: ProfileSlug.BIANCA, displayName: 'Bianca' },
    }),
    prisma.profile.upsert({
      where: { slug: ProfileSlug.SERGIO },
      update: { displayName: 'Sergio' },
      create: { slug: ProfileSlug.SERGIO, displayName: 'Sergio' },
    }),
  ]);

  await removeDemoData(prisma);

  const [acao, fii, tesouro] = await Promise.all([
    prisma.instrument.create({ data: { symbol: 'DEMO3', name: 'Ação Demonstração', type: InstrumentType.STOCK, isDemo: true } }),
    prisma.instrument.create({ data: { symbol: 'DEMO11', name: 'FII Demonstração', type: InstrumentType.FII, isDemo: true } }),
    prisma.instrument.create({
      data: {
        symbol: 'TD-DEMO-IPCA-2035',
        name: 'Tesouro IPCA+ 2035 Demonstração',
        type: InstrumentType.TREASURY,
        treasuryType: 'IPCA+',
        maturityDate: new Date('2035-05-15T00:00:00.000Z'),
        isDemo: true,
      },
    }),
  ]);

  await prisma.operation.createMany({
    data: [
      opening(bianca.id, acao.id, '2026-08-29', '25', '30.00', 'demo-bianca-demo3-opening'),
      opening(bianca.id, fii.id, '2026-08-29', '40', '100.00', 'demo-bianca-demo11-opening'),
      opening(sergio.id, tesouro.id, '2026-08-29', '0.5', '2000.00', 'demo-sergio-td-opening'),
      cash(bianca.id, OperationType.CASH_CONTRIBUTION, '2026-09-02', '500.00', 'demo-bianca-cash'),
      cash(sergio.id, OperationType.CASH_CONTRIBUTION, '2026-09-05', '250.00', 'demo-sergio-cash'),
      { profileId: bianca.id, instrumentId: fii.id, type: OperationType.INCOME, occurredOn: day('2026-09-15'), amount: '32.00', feeAmount: '0', idempotencyKey: 'demo-bianca-fii-income', isDemo: true },
      { profileId: sergio.id, instrumentId: tesouro.id, type: OperationType.BUY, occurredOn: day('2026-09-17'), quantity: '0.1', unitPrice: '2050.00', feeAmount: '0', idempotencyKey: 'demo-sergio-td-buy', isDemo: true },
    ],
  });

  await prisma.priceQuote.createMany({
    data: [
      quote(acao.id, '2026-08-29', '30.00', 'brapi'), quote(fii.id, '2026-08-29', '100.00', 'brapi'), quote(tesouro.id, '2026-08-29', '2000.00', 'tesouro-direto-official'),
      quote(acao.id, '2026-09-22', '32.80', 'brapi'), quote(fii.id, '2026-09-22', '101.10', 'brapi'), quote(tesouro.id, '2026-09-22', '2075.00', 'tesouro-direto-official'),
    ],
  });
}

function opening(profileId: string, instrumentId: string, occurredOn: string, quantity: string, unitPrice: string, idempotencyKey: string) {
  return { profileId, instrumentId, type: OperationType.OPENING_POSITION, occurredOn: day(occurredOn), quantity, unitPrice, feeAmount: '0', idempotencyKey, isDemo: true };
}

function cash(profileId: string, type: OperationType, occurredOn: string, amount: string, idempotencyKey: string) {
  return { profileId, type, occurredOn: day(occurredOn), amount, feeAmount: '0', idempotencyKey, isDemo: true };
}

function quote(instrumentId: string, quotedOn: string, price: string, sourceProvider: 'brapi' | 'tesouro-direto-official') {
  return { instrumentId, quotedOn: day(quotedOn), price, sourceProvider, sourceEndpoint: demoSourceEndpoint, retrievedAt: new Date('2026-09-22T18:15:00.000Z'), publishedOn: day(quotedOn), isDemo: true };
}

function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
