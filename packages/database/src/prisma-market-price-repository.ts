import {
  InstrumentType,
  MarketIngestionStatus,
  MarketRunKind,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from './client.js';
import type {
  EodQuote,
  IngestionRunRecord,
  MarketPriceRepository,
  TrackedInstrument,
} from '@alexa-finances/market-data';

const instrumentTypes: Record<InstrumentType, TrackedInstrument['type']> = {
  STOCK: 'stock',
  FII: 'fii',
  TREASURY: 'treasury',
};
const runKinds: Record<IngestionRunRecord['kind'], MarketRunKind> = {
  'after-open': MarketRunKind.AFTER_OPEN,
  'after-close': MarketRunKind.AFTER_CLOSE,
};
const runStatuses: Record<IngestionRunRecord['status'], MarketIngestionStatus> = {
  succeeded: MarketIngestionStatus.SUCCEEDED,
  partial: MarketIngestionStatus.PARTIAL,
  failed: MarketIngestionStatus.FAILED,
};

/**
 * Prisma persistence for the scheduled market worker. Quotes are only created
 * or updated by their natural key; a failed ingestion never removes history.
 */
export class PrismaMarketPriceRepository implements MarketPriceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listTrackedInstruments(): Promise<readonly TrackedInstrument[]> {
    const instruments = await this.client.instrument.findMany({
      select: { id: true, symbol: true, type: true },
      orderBy: { symbol: 'asc' },
    });
    return instruments.map((instrument) => ({
      id: instrument.id,
      symbol: instrument.symbol,
      type: instrumentTypes[instrument.type],
    }));
  }

  async upsertEodQuote(quote: EodQuote): Promise<'inserted' | 'unchanged' | 'updated'> {
    const where = {
      instrumentId_quotedOn_sourceProvider: {
        instrumentId: quote.instrumentId,
        quotedOn: atUtcMidnight(quote.quotedOn),
        sourceProvider: quote.source.provider,
      },
    };
    const existing = await this.client.priceQuote.findUnique({ where });
    if (!existing) {
      try {
        await this.client.priceQuote.create({ data: quoteData(quote) });
        return 'inserted';
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
    }

    const current = existing ?? await this.client.priceQuote.findUniqueOrThrow({ where });
    if (sameQuote(current, quote)) return 'unchanged';

    await this.client.priceQuote.update({ where: { id: current.id }, data: quoteData(quote) });
    return 'updated';
  }

  async recordIngestionRun(run: IngestionRunRecord): Promise<void> {
    const data = {
      kind: runKinds[run.kind],
      quotedOn: atUtcMidnight(run.quotedOn),
      startedAt: new Date(run.startedAt),
      completedAt: new Date(run.completedAt),
      status: runStatuses[run.status],
      inserted: run.inserted,
      unchanged: run.unchanged,
      updated: run.updated,
      rejected: run.rejected,
      failures: run.failures as unknown as Prisma.InputJsonValue,
    };
    await this.client.marketIngestionRun.upsert({
      where: { idempotencyKey: run.idempotencyKey },
      create: { idempotencyKey: run.idempotencyKey, ...data },
      update: data,
    });
  }
}

function quoteData(quote: EodQuote) {
  return {
    instrumentId: quote.instrumentId,
    quotedOn: atUtcMidnight(quote.quotedOn),
    price: quote.closingPrice,
    sourceProvider: quote.source.provider,
    sourceEndpoint: quote.source.endpoint,
    retrievedAt: new Date(quote.source.retrievedAt),
    publishedOn: atUtcMidnight(quote.source.publishedOn),
    isValid: true,
  };
}

function sameQuote(
  existing: {
    price: { toString(): string };
    sourceEndpoint: string;
    retrievedAt: Date;
    publishedOn: Date;
    isValid: boolean;
  },
  quote: EodQuote,
): boolean {
  return existing.price.toString() === quote.closingPrice
    && existing.sourceEndpoint === quote.source.endpoint
    && existing.retrievedAt.toISOString() === new Date(quote.source.retrievedAt).toISOString()
    && existing.publishedOn.toISOString().slice(0, 10) === quote.source.publishedOn
    && existing.isValid;
}

function atUtcMidnight(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
