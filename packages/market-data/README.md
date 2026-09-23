# Market data

This package imports end-of-day prices for the tracked B3 equity/FII and Tesouro Directo instruments. It does not calculate portfolio performance and does not own database tables.

## Upstream configuration

The application uses a dedicated Brapi adapter for B3 stocks/FIIs and a configurable adapter for Tesouro Direto:

- `BRAPI_API_KEY`: secret sent only as the Brapi `Authorization: Bearer` header;
- `MARKET_TESOURO_EOD_URL`: approved official Tesouro Direto URL template, required only when a Treasury position is tracked.

The Treasury template must be HTTPS and can include `{date}` and `{symbols}`. Before production, record its owner, terms/licence and allowed polling/re-distribution behaviour in deployment configuration.

The Treasury endpoint is expected to return this normalised JSON contract:

```json
{
  "quotes": [
    { "symbol": "PETR4", "closingPrice": "32.50", "quotedOn": "2026-09-22", "publishedOn": "2026-09-22" }
  ]
}
```

Prices are rejected unless positive, decimal and associated with valid ISO dates. Provider failures are recorded; the worker never deletes or nulls an existing quote/snapshot.

## Persistence contract

`MarketPriceRepository.upsertEodQuote` must use a unique key of `(instrumentId, quotedOn, source.provider)` and return `inserted`, `unchanged`, or `updated`. `recordIngestionRun` should be idempotent on `idempotencyKey` (`market:<run-kind>:<date>`). The database/API package owns the concrete schema and implementation.

## Schedule

`MARKET_INGESTION_SCHEDULES` defines weekday runs in `America/Sao_Paulo` at 12:00 and 19:00. The platform scheduler must honor that timezone and skip B3/Tesouro holidays; a weekday cron alone does not identify Brazilian market holidays.
