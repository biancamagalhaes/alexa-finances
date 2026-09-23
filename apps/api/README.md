# API

The API persists the investment ledger. It accepts decimal values as strings so JavaScript floating-point values never enter the financial calculation path.

## Segurança

Todas as rotas em `/v1` exigem `Authorization: Bearer <API_BEARER_TOKEN>`.
Defina um token aleatório com pelo menos 32 caracteres em `apps/api/.env`; a
API não inicia se esse segredo estiver ausente. `GET /health` permanece público
para monitoramento e não expõe dados da carteira.

## Atualização automática de cotações

Com `MARKET_SCHEDULER_ENABLED=true`, a própria API executa a ingestão às
12:00 e 19:00, de segunda a sexta, no fuso `America/Sao_Paulo`. Ações e FIIs
usam `BRAPI_API_KEY`, enviada exclusivamente no header da Brapi. A integração
com Tesouro é opcional até existir uma posição desse tipo e requer
`MARKET_TESOURO_EOD_URL`, um template HTTPS que devolva o contrato
`{"quotes":[...]}` documentado no pacote `@alexa-finances/market-data`.

Use `MARKET_HOLIDAY_DATES` para informar feriados de negociação. A agenda não
consulta um calendário de pregões por conta própria. Uma execução repetida no
mesmo dia é idempotente no banco.

O processo preserva operações e cotações diárias. Logs técnicos de ingestão
(`MarketIngestionRun`) são removidos automaticamente após 90 dias.

Para hospedar como API na Discloud, exponha a aplicação com `PORT=8080` e
`HOST=0.0.0.0`. Nunca publique o banco SQLite ou o `API_BEARER_TOKEN` no
repositório.

## Run locally

```bash
cp apps/api/.env.example apps/api/.env
npm install
npm run generate --workspace=@alexa-finances/database
npm run migrate:dev --workspace=@alexa-finances/database
npm run seed --workspace=@alexa-finances/database
npm run dev --workspace=@alexa-finances/api
```

## API surface

`GET /health`, `GET /v1/profiles`, `GET /v1/instruments`, `POST /v1/instruments`, `GET /v1/operations`, `POST /v1/operations`, `GET /v1/alexa/portfolio-view?profile=…`, and `GET /v1/alexa/voice-status?profile=…`.

Create an equity instrument:

```json
{
  "symbol": "PETR4",
  "name": "Petrobras PN",
  "type": "stock"
}
```

Create a treasury instrument; `treasuryType` and `maturityDate` are mandatory:

```json
{
  "symbol": "TESOURO-IPCA-2035",
  "name": "Tesouro IPCA+ 2035",
  "type": "treasury",
  "treasuryType": "IPCA+",
  "maturityDate": "2035-05-15"
}
```

Record the initial position for Bianca. `idempotencyKey` is unique for a profile: safely retrying this request returns the original operation.

```json
{
  "profileSlug": "bianca",
  "type": "opening_position",
  "instrumentId": "<uuid>",
  "occurredOn": "2026-09-22",
  "quantity": "10",
  "unitPrice": "32.50",
  "feeAmount": "0",
  "idempotencyKey": "bianca-petr4-opening-2026-09-22"
}
```

For `income`, `cash_contribution`, and `cash_withdrawal`, send a positive `amount` string rather than quantity/unit price. Cash operations intentionally omit `instrumentId`.

## Alexa projections

Both Alexa endpoints accept exactly `bianca`, `sergio`, or `family`. `family` is computed from the two persisted profiles and never accepts operations directly.

`/v1/alexa/portfolio-view` returns formatted values plus a masked alternative for every sensitive APL field. The client must start by rendering the masked variants and reveal values only following a local touch event.

`/v1/alexa/voice-status` returns only `resultState`, `hasIncomeThisMonth`, `largestAllocationLabel`, and `updated`. It deliberately contains no currency, percentage, quantity, price, or date. If an open position has no valid quote, either endpoint returns `424 PRICE_UNAVAILABLE`; it never invents a market value.
