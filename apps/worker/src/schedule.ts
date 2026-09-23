import {
  MARKET_INGESTION_SCHEDULES,
  SAO_PAULO_TIME_ZONE,
  type LocalScheduleDefinition,
  type MarketRunKind,
} from '@alexa-finances/market-data';

export { MARKET_INGESTION_SCHEDULES, SAO_PAULO_TIME_ZONE };

/**
 * Platform-neutral scheduling definitions. Configure these cron expressions
 * with America/Sao_Paulo; the invoking platform must also skip market holidays.
 */
export function marketSchedules(): readonly LocalScheduleDefinition[] {
  return MARKET_INGESTION_SCHEDULES;
}

export function marketRunKindFromSchedule(name: string): MarketRunKind {
  if (name === 'after-open' || name === 'after-close') return name;
  throw new Error(`unknown market schedule: ${name}`);
}
