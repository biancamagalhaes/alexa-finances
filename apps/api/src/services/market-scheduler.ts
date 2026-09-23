import { PrismaMarketPriceRepository, prisma } from '@alexa-finances/database';
import {
  createConfiguredMarketIngestionWorker,
  MARKET_INGESTION_SCHEDULES,
  SAO_PAULO_TIME_ZONE,
  type MarketIngestionEnvironment,
  type MarketRunKind,
} from '@alexa-finances/market-data';
import { purgeExpiredMarketIngestionRuns } from './market-data-retention.js';

const pollIntervalMilliseconds = 30_000;

export interface MarketSchedulerEnvironment extends MarketIngestionEnvironment {
  readonly MARKET_SCHEDULER_ENABLED?: string;
  /** Comma-separated B3/Tesouro non-trading dates in YYYY-MM-DD format. */
  readonly MARKET_HOLIDAY_DATES?: string;
}

export interface StartedMarketScheduler {
  stop(): void;
}

interface LocalClock {
  readonly date: string;
  readonly time: string;
  readonly weekday: string;
}

/**
 * Runs inside the API process for a single-instance deployment. The persisted
 * ingestion key makes a restart during the scheduled minute idempotent.
 */
export function startConfiguredMarketScheduler(
  environment: MarketSchedulerEnvironment = process.env,
  now: () => Date = () => new Date(),
  onRun?: (kind: MarketRunKind, quotedOn: string) => Promise<void>,
): StartedMarketScheduler | undefined {
  if (environment.MARKET_SCHEDULER_ENABLED !== 'true') return undefined;

  const invokedSlots = new Set<string>();
  const retentionDays = new Set<string>();
  const run = onRun ?? ((kind: MarketRunKind, quotedOn: string) => defaultRun(environment, kind, quotedOn));
  const holidays = parseHolidayDates(environment.MARKET_HOLIDAY_DATES);
  const tick = () => {
    void runScheduledWork(now(), invokedSlots, retentionDays, run, holidays).catch(() => {
      console.error(JSON.stringify({
        event: 'market_scheduler_error',
        task: 'ingestion',
        message: 'Market ingestion failed; inspect the persisted ingestion run for details',
      }));
    });
  };

  tick();
  const interval = setInterval(tick, pollIntervalMilliseconds);
  interval.unref();
  return { stop: () => clearInterval(interval) };
}

async function runScheduledWork(
  current: Date,
  invokedSlots: Set<string>,
  retentionDays: Set<string>,
  onRun: (kind: MarketRunKind, quotedOn: string) => Promise<void>,
  holidays: ReadonlySet<string>,
): Promise<void> {
  const local = toSaoPauloClock(current);
  if (!retentionDays.has(local.date)) {
    try {
      await purgeExpiredMarketIngestionRuns(local.date);
      retentionDays.add(local.date);
    } catch {
      console.error(JSON.stringify({
        event: 'market_scheduler_error',
        task: 'market_run_retention',
        message: 'Market-run retention failed',
      }));
    }
  }
  await runDueSchedules(current, invokedSlots, onRun, holidays);
}

export async function runDueSchedules(
  now: Date,
  invokedSlots: Set<string>,
  onRun: (kind: MarketRunKind, quotedOn: string) => Promise<void>,
  holidays: ReadonlySet<string> = new Set(),
): Promise<void> {
  const local = toSaoPauloClock(now);
  if (local.weekday === 'Sat' || local.weekday === 'Sun' || holidays.has(local.date)) return;

  for (const schedule of MARKET_INGESTION_SCHEDULES) {
    if (schedule.localTime !== local.time) continue;
    const slot = `${schedule.name}:${local.date}`;
    if (invokedSlots.has(slot)) continue;
    invokedSlots.add(slot);
    await onRun(schedule.name, local.date);
  }
}

async function defaultRun(
  environment: MarketIngestionEnvironment,
  kind: MarketRunKind,
  quotedOn: string,
): Promise<void> {
  const worker = createConfiguredMarketIngestionWorker({
    repository: new PrismaMarketPriceRepository(prisma),
    environment,
  });
  await worker.run(kind, quotedOn);
}

function parseHolidayDates(value: string | undefined): ReadonlySet<string> {
  if (!value) return new Set();
  const dates = value.split(',').map((date) => date.trim()).filter(Boolean);
  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('MARKET_HOLIDAY_DATES must contain YYYY-MM-DD dates');
  }
  return new Set(dates);
}

function toSaoPauloClock(value: Date): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  const minute = part('minute');
  const weekday = part('weekday');
  if (!year || !month || !day || !hour || !minute || !weekday) throw new Error('could not calculate São Paulo schedule time');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}`, weekday };
}
