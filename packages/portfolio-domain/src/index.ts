export const MONEY_SCALE = 100n;
export const QUANTITY_SCALE = 1_000_000n;

export type MoneyCents = bigint;
export type Quantity = bigint;
export type ProfileId = 'bianca' | 'sergio';
export type InvestmentType = 'stock' | 'fii' | 'treasury';

export interface Asset {
  readonly id: string;
  readonly symbol: string;
  readonly type: InvestmentType;
}

/**
 * Positions supplied when the app starts tracking an existing portfolio.
 * They are treated as holdings before every operation in `operations`.
 */
export interface InitialPosition {
  readonly profileId: ProfileId;
  readonly asset: Asset;
  readonly quantity: Quantity;
  readonly averageCostCents: MoneyCents;
}

/** Cash already held when tracking starts. Missing profiles start with zero cash. */
export type InitialCashCentsByProfile = Readonly<Partial<Record<ProfileId, MoneyCents>>>;

interface BaseOperation {
  readonly id: string;
  readonly profileId: ProfileId;
  /** ISO calendar date (YYYY-MM-DD). Operations on the same day preserve input order. */
  readonly occurredOn: string;
}

export interface PurchaseOperation extends BaseOperation {
  readonly kind: 'purchase';
  readonly asset: Asset;
  readonly quantity: Quantity;
  readonly unitPriceCents: MoneyCents;
  readonly feeCents?: MoneyCents;
}

export interface SaleOperation extends BaseOperation {
  readonly kind: 'sale';
  readonly assetId: string;
  readonly quantity: Quantity;
  readonly unitPriceCents: MoneyCents;
  readonly feeCents?: MoneyCents;
}

export interface ProventOperation extends BaseOperation {
  readonly kind: 'provent';
  readonly assetId?: string;
  readonly amountCents: MoneyCents;
}

export interface ContributionOperation extends BaseOperation {
  readonly kind: 'contribution';
  readonly amountCents: MoneyCents;
}

export interface WithdrawalOperation extends BaseOperation {
  readonly kind: 'withdrawal';
  readonly amountCents: MoneyCents;
}

export type Operation =
  | PurchaseOperation
  | SaleOperation
  | ProventOperation
  | ContributionOperation
  | WithdrawalOperation;

export interface Position {
  readonly profileId: ProfileId;
  readonly asset: Asset;
  readonly quantity: Quantity;
  /** Exact remaining acquisition cost, including purchase fees. */
  readonly costBasisCents: MoneyCents;
  readonly averageCostCents: MoneyCents;
  readonly marketValueCents: MoneyCents;
  readonly unrealizedResultCents: MoneyCents;
}

export interface PortfolioTotals {
  readonly marketValueCents: MoneyCents;
  /** Money not currently allocated to an asset. It can be negative when operations omit their funding contribution. */
  readonly cashBalanceCents: MoneyCents;
  /** Total wealth shown as patrimônio: market value of positions plus available cash. */
  readonly patrimonyCents: MoneyCents;
  readonly openCostBasisCents: MoneyCents;
  readonly unrealizedResultCents: MoneyCents;
  readonly realizedResultCents: MoneyCents;
  readonly proventsCents: MoneyCents;
  /** Explicit money put into the portfolio. Purchases are deliberately excluded. */
  readonly contributionsCents: MoneyCents;
  readonly withdrawalsCents: MoneyCents;
  readonly netContributionsCents: MoneyCents;
  /** Cost of the opening positions plus all purchases, before sales. */
  readonly grossPurchaseCostCents: MoneyCents;
}

export interface PortfolioSnapshot {
  readonly profileId: ProfileId | 'family';
  readonly positions: readonly Position[];
  readonly totals: PortfolioTotals;
}

export interface PortfolioInput {
  readonly profileId: ProfileId | 'family';
  readonly initialPositions: readonly InitialPosition[];
  readonly initialCashCentsByProfile?: InitialCashCentsByProfile;
  readonly operations: readonly Operation[];
  readonly pricesCentsByAssetId: Readonly<Record<string, MoneyCents>>;
}

export interface MonthlyResultInput {
  readonly profileId: ProfileId | 'family';
  readonly month: string;
  readonly initialPositions: readonly InitialPosition[];
  readonly initialCashCentsByProfile?: InitialCashCentsByProfile;
  readonly operations: readonly Operation[];
  /** Closing price on the final trading day before the requested month. */
  readonly startPricesCentsByAssetId: Readonly<Record<string, MoneyCents>>;
  /** Latest/closing price for the requested month. */
  readonly endPricesCentsByAssetId: Readonly<Record<string, MoneyCents>>;
}

export interface MonthlyResult {
  readonly openingMarketValueCents: MoneyCents;
  readonly closingMarketValueCents: MoneyCents;
  readonly openingCashCents: MoneyCents;
  readonly closingCashCents: MoneyCents;
  readonly openingPatrimonyCents: MoneyCents;
  readonly closingPatrimonyCents: MoneyCents;
  readonly purchasesCents: MoneyCents;
  readonly saleProceedsCents: MoneyCents;
  readonly proventsCents: MoneyCents;
  /** Contributions and withdrawals are reported, but never treated as investment return. */
  readonly contributionsCents: MoneyCents;
  readonly withdrawalsCents: MoneyCents;
  /**
   * closing patrimônio - opening patrimônio - contributions + withdrawals.
   * Cash already contains purchases, sale proceeds and provents, so this includes each return once.
   */
  readonly resultCents: MoneyCents;
}

interface MutablePosition {
  profileId: ProfileId;
  asset: Asset;
  quantity: Quantity;
  costBasisCents: MoneyCents;
}

interface ReplayResult {
  positions: Map<string, MutablePosition>;
  realizedResultCents: MoneyCents;
  proventsCents: MoneyCents;
  contributionsCents: MoneyCents;
  withdrawalsCents: MoneyCents;
  grossPurchaseCostCents: MoneyCents;
  cashBalanceCents: MoneyCents;
}

const zeroReplay = (): ReplayResult => ({
  positions: new Map(),
  realizedResultCents: 0n,
  proventsCents: 0n,
  contributionsCents: 0n,
  withdrawalsCents: 0n,
  grossPurchaseCostCents: 0n,
  cashBalanceCents: 0n,
});

export function moneyFromDecimal(value: string): MoneyCents {
  return parseScaledDecimal(value, MONEY_SCALE, 2);
}

export function quantityFromDecimal(value: string): Quantity {
  return parseScaledDecimal(value, QUANTITY_SCALE, 6);
}

export function moneyToDecimal(value: MoneyCents): string {
  return scaledToDecimal(value, 2);
}

export function quantityToDecimal(value: Quantity): string {
  return scaledToDecimal(value, 6);
}

export function calculatePortfolio(input: PortfolioInput): PortfolioSnapshot {
  const targetProfiles = profilesFor(input.profileId);
  const replay = replayPortfolio(input.initialPositions, input.operations, targetProfiles, input.initialCashCentsByProfile);
  const positions = [...replay.positions.values()]
    .filter((position) => position.quantity > 0n)
    .sort((left, right) => left.asset.symbol.localeCompare(right.asset.symbol))
    .map((position): Position => {
      const price = requiredPrice(input.pricesCentsByAssetId, position.asset.id);
      const marketValueCents = valueAtPrice(position.quantity, price);
      return {
        ...position,
        averageCostCents: position.costBasisCents * QUANTITY_SCALE / position.quantity,
        marketValueCents,
        unrealizedResultCents: marketValueCents - position.costBasisCents,
      };
    });

  const marketValueCents = sum(positions.map((position) => position.marketValueCents));
  const cashBalanceCents = replay.cashBalanceCents;
  const openCostBasisCents = sum(positions.map((position) => position.costBasisCents));
  const contributionsCents = replay.contributionsCents;
  const withdrawalsCents = replay.withdrawalsCents;

  return {
    profileId: input.profileId,
    positions,
    totals: {
      marketValueCents,
      cashBalanceCents,
      patrimonyCents: marketValueCents + cashBalanceCents,
      openCostBasisCents,
      unrealizedResultCents: marketValueCents - openCostBasisCents,
      realizedResultCents: replay.realizedResultCents,
      proventsCents: replay.proventsCents,
      contributionsCents,
      withdrawalsCents,
      netContributionsCents: contributionsCents - withdrawalsCents,
      grossPurchaseCostCents: replay.grossPurchaseCostCents,
    },
  };
}

export function calculateMonthlyResult(input: MonthlyResultInput): MonthlyResult {
  assertMonth(input.month);
  const targetProfiles = profilesFor(input.profileId);
  const monthStart = `${input.month}-01`;
  const preMonth = input.operations.filter((operation) =>
    targetProfiles.has(operation.profileId) && operation.occurredOn < monthStart,
  );
  const monthOperations = input.operations.filter((operation) =>
    targetProfiles.has(operation.profileId) && operation.occurredOn.startsWith(`${input.month}-`),
  );

  const opening = replayPortfolio(input.initialPositions, preMonth, targetProfiles, input.initialCashCentsByProfile);
  const openingMarketValueCents = marketValue(opening.positions, input.startPricesCentsByAssetId);
  const closing = replayPortfolio(input.initialPositions, [...preMonth, ...monthOperations], targetProfiles, input.initialCashCentsByProfile);
  const closingMarketValueCents = marketValue(closing.positions, input.endPricesCentsByAssetId);

  let purchasesCents = 0n;
  let saleProceedsCents = 0n;
  let proventsCents = 0n;
  let contributionsCents = 0n;
  let withdrawalsCents = 0n;
  for (const operation of ordered(monthOperations)) {
    switch (operation.kind) {
      case 'purchase':
        purchasesCents += valueAtPrice(operation.quantity, operation.unitPriceCents) + fee(operation);
        break;
      case 'sale':
        saleProceedsCents += valueAtPrice(operation.quantity, operation.unitPriceCents) - fee(operation);
        break;
      case 'provent':
        proventsCents += operation.amountCents;
        break;
      case 'contribution':
        contributionsCents += operation.amountCents;
        break;
      case 'withdrawal':
        withdrawalsCents += operation.amountCents;
        break;
    }
  }

  return {
    openingMarketValueCents,
    closingMarketValueCents,
    openingCashCents: opening.cashBalanceCents,
    closingCashCents: closing.cashBalanceCents,
    openingPatrimonyCents: openingMarketValueCents + opening.cashBalanceCents,
    closingPatrimonyCents: closingMarketValueCents + closing.cashBalanceCents,
    purchasesCents,
    saleProceedsCents,
    proventsCents,
    contributionsCents,
    withdrawalsCents,
    resultCents:
      closingMarketValueCents + closing.cashBalanceCents
      - openingMarketValueCents - opening.cashBalanceCents
      - contributionsCents + withdrawalsCents,
  };
}

function replayPortfolio(
  initialPositions: readonly InitialPosition[],
  operations: readonly Operation[],
  targetProfiles: ReadonlySet<ProfileId>,
  initialCashCentsByProfile: InitialCashCentsByProfile | undefined,
): ReplayResult {
  const result = zeroReplay();
  for (const profileId of targetProfiles) {
    const initialCashCents = initialCashCentsByProfile?.[profileId] ?? 0n;
    assertNonNegative(initialCashCents, `Initial cash for ${profileId}`);
    result.cashBalanceCents += initialCashCents;
  }
  for (const initial of initialPositions) {
    assertProfile(initial.profileId);
    if (!targetProfiles.has(initial.profileId)) continue;
    assertPositive(initial.quantity, 'Initial position quantity');
    assertNonNegative(initial.averageCostCents, 'Initial position average cost');
    const key = positionKey(initial.profileId, initial.asset.id);
    if (result.positions.has(key)) throw new Error(`Duplicate initial position: ${key}`);
    const costBasisCents = valueAtPrice(initial.quantity, initial.averageCostCents);
    result.positions.set(key, {
      profileId: initial.profileId,
      asset: initial.asset,
      quantity: initial.quantity,
      costBasisCents,
    });
    result.grossPurchaseCostCents += costBasisCents;
  }

  for (const operation of ordered(operations)) {
    assertProfile(operation.profileId);
    if (!targetProfiles.has(operation.profileId)) continue;
    switch (operation.kind) {
      case 'purchase':
        applyPurchase(result, operation);
        break;
      case 'sale':
        applySale(result, operation);
        break;
      case 'provent':
        assertPositive(operation.amountCents, 'Provent amount');
        result.proventsCents += operation.amountCents;
        result.cashBalanceCents += operation.amountCents;
        break;
      case 'contribution':
        assertPositive(operation.amountCents, 'Contribution amount');
        result.contributionsCents += operation.amountCents;
        result.cashBalanceCents += operation.amountCents;
        break;
      case 'withdrawal':
        assertPositive(operation.amountCents, 'Withdrawal amount');
        result.withdrawalsCents += operation.amountCents;
        result.cashBalanceCents -= operation.amountCents;
        break;
    }
  }
  return result;
}

function applyPurchase(result: ReplayResult, operation: PurchaseOperation): void {
  assertPositive(operation.quantity, 'Purchase quantity');
  assertNonNegative(operation.unitPriceCents, 'Purchase unit price');
  assertNonNegative(fee(operation), 'Purchase fee');
  const totalCostCents = valueAtPrice(operation.quantity, operation.unitPriceCents) + fee(operation);
  const key = positionKey(operation.profileId, operation.asset.id);
  const existing = result.positions.get(key);
  if (existing) {
    assertSameAsset(existing.asset, operation.asset);
    existing.quantity += operation.quantity;
    existing.costBasisCents += totalCostCents;
  } else {
    result.positions.set(key, {
      profileId: operation.profileId,
      asset: operation.asset,
      quantity: operation.quantity,
      costBasisCents: totalCostCents,
    });
  }
  result.grossPurchaseCostCents += totalCostCents;
  result.cashBalanceCents -= totalCostCents;
}

function applySale(result: ReplayResult, operation: SaleOperation): void {
  assertPositive(operation.quantity, 'Sale quantity');
  assertNonNegative(operation.unitPriceCents, 'Sale unit price');
  assertNonNegative(fee(operation), 'Sale fee');
  const position = result.positions.get(positionKey(operation.profileId, operation.assetId));
  if (!position || position.quantity < operation.quantity) {
    throw new Error(`Cannot sell ${operation.assetId}: insufficient position`);
  }
  const disposedCostCents = position.costBasisCents * operation.quantity / position.quantity;
  const proceedsCents = valueAtPrice(operation.quantity, operation.unitPriceCents) - fee(operation);
  position.quantity -= operation.quantity;
  position.costBasisCents -= disposedCostCents;
  result.realizedResultCents += proceedsCents - disposedCostCents;
  result.cashBalanceCents += proceedsCents;
  if (position.quantity === 0n) {
    result.positions.delete(positionKey(operation.profileId, operation.assetId));
  }
}

function marketValue(
  positions: ReadonlyMap<string, MutablePosition>,
  pricesCentsByAssetId: Readonly<Record<string, MoneyCents>>,
): MoneyCents {
  return sum([...positions.values()].map((position) =>
    valueAtPrice(position.quantity, requiredPrice(pricesCentsByAssetId, position.asset.id)),
  ));
}

function ordered(operations: readonly Operation[]): readonly Operation[] {
  return operations
    .map((operation, index) => ({ operation, index }))
    .sort((left, right) => left.operation.occurredOn.localeCompare(right.operation.occurredOn) || left.index - right.index)
    .map(({ operation }) => operation);
}

function profilesFor(profileId: ProfileId | 'family'): ReadonlySet<ProfileId> {
  return profileId === 'family' ? new Set<ProfileId>(['bianca', 'sergio']) : new Set<ProfileId>([profileId]);
}

function positionKey(profileId: ProfileId, assetId: string): string {
  return `${profileId}:${assetId}`;
}

function valueAtPrice(quantity: Quantity, unitPriceCents: MoneyCents): MoneyCents {
  return quantity * unitPriceCents / QUANTITY_SCALE;
}

function fee(operation: PurchaseOperation | SaleOperation): MoneyCents {
  return operation.feeCents ?? 0n;
}

function requiredPrice(prices: Readonly<Record<string, MoneyCents>>, assetId: string): MoneyCents {
  const price = prices[assetId];
  if (price === undefined) throw new Error(`Missing price for asset: ${assetId}`);
  assertNonNegative(price, `Price for ${assetId}`);
  return price;
}

function sum(values: readonly MoneyCents[]): MoneyCents {
  return values.reduce((total, value) => total + value, 0n);
}

function assertProfile(profileId: ProfileId): void {
  if (profileId !== 'bianca' && profileId !== 'sergio') {
    throw new Error('Family is a calculated profile and cannot receive operations');
  }
}

function assertSameAsset(existing: Asset, incoming: Asset): void {
  if (existing.symbol !== incoming.symbol || existing.type !== incoming.type) {
    throw new Error(`Conflicting asset details for ${existing.id}`);
  }
}

function assertPositive(value: bigint, label: string): void {
  if (value <= 0n) throw new Error(`${label} must be positive`);
}

function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) throw new Error(`${label} cannot be negative`);
}

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must be YYYY-MM');
}

function parseScaledDecimal(value: string, scale: bigint, decimals: number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid decimal: ${value}`);
  const sign = match[1] === '-' ? -1n : 1n;
  const integerPart = match[2] ?? '0';
  const decimalPart = match[3] ?? '';
  if (decimalPart.length > decimals) throw new Error(`Decimal has more than ${decimals} places: ${value}`);
  return sign * (BigInt(integerPart) * scale + BigInt(decimalPart.padEnd(decimals, '0') || '0'));
}

function scaledToDecimal(value: bigint, decimals: number): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const integerPart = absolute / base;
  const decimalPart = (absolute % base).toString().padStart(decimals, '0');
  return `${sign}${integerPart}.${decimalPart}`;
}
