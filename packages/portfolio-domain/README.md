# Portfolio domain

Pure, database-agnostic calculations for Bianca, Sergio and the calculated `family` view.

All money values are integer cents (`bigint`). Quantities use integer millionths (`bigint`), which supports fractional Tesouro positions. Parse request values with `moneyFromDecimal` and `quantityFromDecimal`; never pass JavaScript `number` values into the calculation functions.

`initialCashCentsByProfile` is optional and defaults to zero. Cash is maintained as `initial cash + contributions - withdrawals - purchases - purchase fees + net sale proceeds + provents`. `patrimonyCents` is positions at market value plus that cash balance.

`family` is an aggregate only. The exported input types make `profileId` on operations `bianca | sergio`, never `family`.

## Monthly result

`calculateMonthlyResult` requires a price at the last close before the month and an end-of-month/latest close. It calculates:

```
closing patrimônio - opening patrimônio - contributions + withdrawals
```

External contributions and withdrawals are reported separately, so they cannot be mistaken for investment return. Provents are included once: as cash, not added again to the return formula.

## Test

From this directory, after workspace dependencies are installed:

```
npm test
npm run typecheck
```
