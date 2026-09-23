import { PrismaMarketPriceRepository, prisma } from '@alexa-finances/database';
import { pathToFileURL } from 'node:url';
import type { IngestionRunRecord, MarketRunKind } from '@alexa-finances/market-data';
import { runConfiguredMarketIngestion, type WorkerEnvironment } from './market-ingestion.js';

interface MarketIngestionSummary {
  readonly kind: MarketRunKind;
  readonly quotedOn: string;
  readonly status: IngestionRunRecord['status'];
  readonly quotes: {
    readonly inserted: number;
    readonly unchanged: number;
    readonly updated: number;
    readonly rejected: number;
  };
  readonly failures: readonly {
    readonly provider: string;
    readonly retryable: boolean;
  }[];
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  environment: WorkerEnvironment & DatabaseEnvironment = process.env,
): Promise<number> {
  try {
    const { kind, quotedOn } = parseInvocation(args);
    validateEnvironment(environment);

    const run = await runConfiguredMarketIngestion({
      repository: new PrismaMarketPriceRepository(prisma),
      environment,
      kind,
      quotedOn,
    });
    console.log(JSON.stringify(toSummary(run)));
    return run.status === 'succeeded' ? 0 : 1;
  } catch {
    console.error(JSON.stringify({ status: 'failed', message: 'market ingestion could not be completed' }));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

export function parseInvocation(args: readonly string[]): { readonly kind: MarketRunKind; readonly quotedOn: string } {
  if (args.length !== 2) throw new Error('expected run kind and quoted date');
  const [kind, quotedOn] = args;
  if (kind !== 'after-open' && kind !== 'after-close') throw new Error('invalid run kind');
  if (!isIsoDate(quotedOn)) throw new Error('quoted date must be an ISO calendar date');
  return { kind, quotedOn };
}

export function validateEnvironment(environment: WorkerEnvironment & DatabaseEnvironment): void {
  validateDatabaseEnvironment(environment);
  if (!environment.BRAPI_API_KEY || environment.BRAPI_API_KEY.trim().length < 8) {
    throw new Error('BRAPI_API_KEY is required');
  }
  if (environment.MARKET_TESOURO_EOD_URL) {
    validateHttpsEndpoint(environment.MARKET_TESOURO_EOD_URL, 'MARKET_TESOURO_EOD_URL');
  }
}

export function toSummary(run: IngestionRunRecord): MarketIngestionSummary {
  return {
    kind: run.kind,
    quotedOn: run.quotedOn,
    status: run.status,
    quotes: {
      inserted: run.inserted,
      unchanged: run.unchanged,
      updated: run.updated,
      rejected: run.rejected,
    },
    failures: run.failures.map(({ provider, retryable }) => ({ provider, retryable })),
  };
}

interface DatabaseEnvironment {
  readonly DATABASE_URL?: string;
  readonly TURSO_DATABASE_URL?: string;
  readonly TURSO_AUTH_TOKEN?: string;
}

function validateDatabaseEnvironment(environment: DatabaseEnvironment): void {
  const hasTursoUrl = Boolean(environment.TURSO_DATABASE_URL);
  const hasTursoToken = Boolean(environment.TURSO_AUTH_TOKEN);
  if (hasTursoUrl || hasTursoToken) {
    if (!hasTursoUrl || !hasTursoToken) throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured together');
    if (!environment.TURSO_DATABASE_URL!.startsWith('libsql://')) throw new Error('TURSO_DATABASE_URL must use libsql://');
    return;
  }
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!environment.DATABASE_URL.startsWith('file:')) throw new Error('DATABASE_URL must be a SQLite file URL');
}

function validateHttpsEndpoint(value: string | undefined, name: string): void {
  if (!value) throw new Error(`${name} is required`);
  let url: URL;
  try {
    url = new URL(value.replaceAll('{date}', '2026-01-01').replaceAll('{symbols}', 'PETR4'));
  } catch {
    throw new Error(`${name} must be an HTTPS endpoint`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must be an HTTPS endpoint`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
