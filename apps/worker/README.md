# Worker

The worker exposes timezone-aware weekday market schedule definitions. Deployment invokes it twice in `America/Sao_Paulo` using the definitions exported by `src/schedule.ts`; holiday filtering belongs to the deployed scheduler/calendar integration.

`createMarketIngestionWorker` reads `BRAPI_API_KEY` for stocks/FIIs and optionally `MARKET_TESOURO_EOD_URL` for Tesouro. The concrete `MarketPriceRepository` is supplied by `@alexa-finances/database`. This app does not configure AWS or database credentials. See [`@alexa-finances/market-data`](../../packages/market-data/README.md) for the endpoint contract, source terms review, retry behavior and persistence requirements.

Run one ingestion with the configured SQLite database file and Brapi key:

```sh
npm run ingest --workspace=@alexa-finances/worker -- after-close 2026-09-22
```

The command requires `DATABASE_URL` and `BRAPI_API_KEY`. `MARKET_TESOURO_EOD_URL`
is required only for a tracked Treasury position. It accepts only `after-open` or `after-close` and an
ISO calendar date. Its JSON output includes counts and provider failure state,
but omits endpoint URLs, connection details, quote prices, and upstream error
messages. A partial or failed run exits non-zero after its safe, idempotent
record is persisted.
