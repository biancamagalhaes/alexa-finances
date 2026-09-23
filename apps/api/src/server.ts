import { buildApp } from './app.js';
import { startConfiguredMarketScheduler } from './services/market-scheduler.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

async function start() {
  try {
    startConfiguredMarketScheduler();
    await app.listen({ port, host });
  } catch (error) {
    const candidate = typeof error === 'object' && error !== null ? error as { name?: unknown; code?: unknown } : {};
    app.log.error({
      event: 'api_startup_failed',
      errorName: typeof candidate.name === 'string' ? candidate.name : undefined,
      errorCode: typeof candidate.code === 'string' || typeof candidate.code === 'number' ? candidate.code : undefined,
    }, 'API startup failed');
    process.exit(1);
  }
}

void start();
