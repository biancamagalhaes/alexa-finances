import { describe, expect, it } from 'vitest';
import type { MarketRunKind } from '@alexa-finances/market-data';
import { runDueSchedules, startConfiguredMarketScheduler } from '../src/services/market-scheduler.js';
import { marketRunRetentionCutoff } from '../src/services/market-data-retention.js';

describe('market scheduler', () => {
  it('runs the two configured São Paulo weekday slots once each', async () => {
    const invoked = new Set<string>();
    const calls: string[] = [];
    const run = async (kind: MarketRunKind, date: string) => { calls.push(`${kind}:${date}`); };

    await runDueSchedules(new Date('2026-09-22T15:00:00.000Z'), invoked, run);
    await runDueSchedules(new Date('2026-09-22T15:00:20.000Z'), invoked, run);
    await runDueSchedules(new Date('2026-09-22T22:00:00.000Z'), invoked, run);

    expect(calls).toEqual(['after-open:2026-09-22', 'after-close:2026-09-22']);
  });

  it('does not run on weekends or when the scheduler is disabled', async () => {
    const invoked = new Set<string>();
    const run = async () => { throw new Error('should not run'); };
    await runDueSchedules(new Date('2026-09-26T15:00:00.000Z'), invoked, run);
    expect(invoked.size).toBe(0);
    expect(startConfiguredMarketScheduler({ MARKET_SCHEDULER_ENABLED: 'false' })).toBeUndefined();
  });

  it('does not run on a configured market holiday', async () => {
    const invoked = new Set<string>();
    const run = async () => { throw new Error('should not run'); };
    await runDueSchedules(
      new Date('2026-09-22T15:00:00.000Z'),
      invoked,
      run,
      new Set(['2026-09-22']),
    );
    expect(invoked.size).toBe(0);
  });

  it('keeps 90 days of market-run logs', () => {
    expect(marketRunRetentionCutoff('2026-09-23').toISOString()).toBe('2026-06-25T00:00:00.000Z');
  });
});
