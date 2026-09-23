import {
  calculateMonthlyResult,
  calculatePortfolio,
  type Asset,
  type InvestmentType,
  type Operation as DomainOperation,
  type ProfileId as DomainProfileId,
  type MoneyCents,
} from '@alexa-finances/portfolio-domain';

export const alexaProfiles = ['bianca', 'sergio', 'family'] as const;
export type AlexaProfile = (typeof alexaProfiles)[number];
export type ResultState = 'positive' | 'negative' | 'neutral';

export interface PortfolioView {
  profile: { id: AlexaProfile; label: 'Bianca' | 'Sergio' | 'Família' };
  asOfLabel: string;
  resultState: ResultState;
  resultLabel: string;
  allocation: Array<{ label: string; percentage: number; percentageLabel: string }>;
  positions: Array<{
    symbol: string;
    classLabel: string;
    maskedValue: string;
    value: string;
    resultState: ResultState;
    resultLabel: string;
  }>;
  summary: {
    maskedPatrimony: string;
    patrimony: string;
    maskedMonthlyResult: string;
    monthlyResult: string;
    maskedContributions: string;
    contributions: string;
    maskedIncome: string;
    income: string;
  };
}

export interface VoiceStatus {
  resultState: ResultState;
  hasIncomeThisMonth: boolean;
  largestAllocationLabel: string | null;
  updated: boolean;
}

type DecimalLike = { toString(): string };
type DateLike = Date | string;

export interface StoredInstrument {
  id: string;
  symbol: string;
  type: string;
}

export interface StoredOperation {
  id: string;
  type: string;
  occurredOn: DateLike;
  quantity: DecimalLike | null;
  unitPrice: DecimalLike | null;
  amount: DecimalLike | null;
  feeAmount: DecimalLike;
  profile: { slug: string };
  instrument: StoredInstrument | null;
}

export interface StoredPriceQuote {
  instrumentId: string;
  closingOn: DateLike;
  price: DecimalLike;
  fetchedAt: DateLike;
  isValid: boolean;
}

export interface PortfolioContractInput {
  profile: AlexaProfile;
  operations: readonly StoredOperation[];
  quotes: readonly StoredPriceQuote[];
  /** Calendar date in the deployment timezone. Defaults to the current UTC date. */
  asOf?: string;
}

export type PortfolioContractResult =
  | { kind: 'ready'; view: PortfolioView; voice: VoiceStatus }
  | { kind: 'price_unavailable'; message: string };

const MASKED_VALUE = '••••••';
const profileLabels: Record<AlexaProfile, PortfolioView['profile']['label']> = {
  bianca: 'Bianca',
  sergio: 'Sergio',
  family: 'Família',
};
const classLabels: Record<InvestmentType, string> = {
  stock: 'Ações',
  fii: 'FIIs',
  treasury: 'Tesouro Direto',
};

export function buildPortfolioContract(input: PortfolioContractInput): PortfolioContractResult {
  const asOf = input.asOf ?? calendarDate(new Date());
  const month = asOf.slice(0, 7);
  const initialPositions = input.operations
    .filter((operation) => operation.type === 'OPENING_POSITION')
    .map(toInitialPosition);
  const operations = input.operations
    .filter((operation) => operation.type !== 'OPENING_POSITION')
    .map(toDomainOperation);
  const latestQuotes = latestQuotesByInstrument(input.quotes, asOf);
  const startQuotes = latestQuotesByInstrument(input.quotes, `${month}-01`, true);

  let portfolio;
  try {
    portfolio = calculatePortfolio({
      profileId: input.profile,
      initialPositions,
      operations,
      pricesCentsByAssetId: latestQuotes.prices,
    });
  } catch (error) {
    if (isMissingPriceError(error)) {
      return { kind: 'price_unavailable', message: 'No valid daily quote is available for one or more open positions' };
    }
    throw error;
  }

  let monthlyResult: MoneyCents | null = null;
  try {
    monthlyResult = calculateMonthlyResult({
      profileId: input.profile,
      month,
      initialPositions,
      operations,
      startPricesCentsByAssetId: startQuotes.prices,
      endPricesCentsByAssetId: latestQuotes.prices,
    }).resultCents;
  } catch (error) {
    if (!isMissingPriceError(error)) throw error;
  }

  const resultState = stateFor(monthlyResult ?? 0n);
  const allocationValues = new Map<string, MoneyCents>();
  for (const position of portfolio.positions) {
    const label = classLabels[position.asset.type];
    allocationValues.set(label, (allocationValues.get(label) ?? 0n) + position.marketValueCents);
  }
  const allocation = [...allocationValues.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([label, value]) => ({
      label,
      percentage: percentage(value, portfolio.totals.marketValueCents),
      percentageLabel: percentageLabel(value, portfolio.totals.marketValueCents),
    }));
  const largestAllocationLabel = [...allocationValues.entries()]
    .sort((left, right) => compareBigInt(right[1], left[1]) || left[0].localeCompare(right[0], 'pt-BR'))[0]?.[0] ?? null;
  const hasIncomeThisMonth = operations.some((operation) =>
    operation.kind === 'provent' && operation.occurredOn.startsWith(`${month}-`)
    && includesProfile(input.profile, operation.profileId),
  );

  const newestQuote = latestQuotes.latestClosingOn;
  const monthlyValue = monthlyResult === null ? '—' : formatCurrency(monthlyResult, true);
  const monthlyMaskedValue = monthlyResult === null ? '—' : MASKED_VALUE;
  const view: PortfolioView = {
    profile: { id: input.profile, label: profileLabels[input.profile] },
    asOfLabel: newestQuote ? `Atualizado em ${formatDate(newestQuote)}` : 'Sem cotações disponíveis',
    resultState,
    resultLabel: monthlyResult === null ? 'Resultado mensal indisponível' : resultLabel(resultState),
    allocation,
    positions: portfolio.positions.map((position) => ({
      symbol: position.asset.symbol,
      classLabel: classLabels[position.asset.type],
      maskedValue: MASKED_VALUE,
      value: formatCurrency(position.marketValueCents),
      resultState: stateFor(position.unrealizedResultCents),
      resultLabel: resultLabel(stateFor(position.unrealizedResultCents)),
    })),
    summary: {
      maskedPatrimony: MASKED_VALUE,
      patrimony: formatCurrency(portfolio.totals.patrimonyCents),
      maskedMonthlyResult: monthlyMaskedValue,
      monthlyResult: monthlyValue,
      maskedContributions: MASKED_VALUE,
      contributions: formatCurrency(portfolio.totals.contributionsCents),
      maskedIncome: MASKED_VALUE,
      income: formatCurrency(portfolio.totals.proventsCents),
    },
  };

  return {
    kind: 'ready',
    view,
    voice: {
      resultState,
      hasIncomeThisMonth,
      largestAllocationLabel: largestAllocationLabel?.toLocaleLowerCase('pt-BR') ?? null,
      updated: newestQuote !== null,
    },
  };
}

function toInitialPosition(operation: StoredOperation) {
  const instrument = requiredInstrument(operation);
  return {
    profileId: toDomainProfile(operation.profile.slug),
    asset: toAsset(instrument),
    quantity: decimalQuantity(operation.quantity, 'opening position quantity'),
    averageCostCents: decimalMoney(operation.unitPrice, 'opening position unit price'),
  };
}

function toDomainOperation(operation: StoredOperation): DomainOperation {
  const profileId = toDomainProfile(operation.profile.slug);
  const occurredOn = calendarDate(operation.occurredOn);
  switch (operation.type) {
    case 'BUY': {
      const instrument = requiredInstrument(operation);
      return {
        id: operation.id,
        kind: 'purchase',
        profileId,
        occurredOn,
        asset: toAsset(instrument),
        quantity: decimalQuantity(operation.quantity, 'purchase quantity'),
        unitPriceCents: decimalMoney(operation.unitPrice, 'purchase unit price'),
        feeCents: decimalMoney(operation.feeAmount, 'purchase fee'),
      };
    }
    case 'SELL':
      return {
        id: operation.id,
        kind: 'sale',
        profileId,
        occurredOn,
        assetId: requiredInstrument(operation).id,
        quantity: decimalQuantity(operation.quantity, 'sale quantity'),
        unitPriceCents: decimalMoney(operation.unitPrice, 'sale unit price'),
        feeCents: decimalMoney(operation.feeAmount, 'sale fee'),
      };
    case 'INCOME':
      return { id: operation.id, kind: 'provent', profileId, occurredOn, assetId: requiredInstrument(operation).id, amountCents: decimalMoney(operation.amount, 'income amount') };
    case 'CASH_CONTRIBUTION':
      return { id: operation.id, kind: 'contribution', profileId, occurredOn, amountCents: decimalMoney(operation.amount, 'contribution amount') };
    case 'CASH_WITHDRAWAL':
      return { id: operation.id, kind: 'withdrawal', profileId, occurredOn, amountCents: decimalMoney(operation.amount, 'withdrawal amount') };
    default:
      throw new Error(`Unsupported operation type: ${operation.type}`);
  }
}

function latestQuotesByInstrument(quotes: readonly StoredPriceQuote[], boundary: string, exclusive = false): { prices: Record<string, MoneyCents>; latestClosingOn: string | null } {
  const selected = new Map<string, StoredPriceQuote>();
  for (const quote of quotes) {
    if (!quote.isValid) continue;
    const closingOn = calendarDate(quote.closingOn);
    if (exclusive ? closingOn >= boundary : closingOn > boundary) continue;
    const current = selected.get(quote.instrumentId);
    if (!current || compareQuote(quote, current) > 0) selected.set(quote.instrumentId, quote);
  }

  const prices: Record<string, MoneyCents> = {};
  let latestClosingOn: string | null = null;
  for (const [instrumentId, quote] of selected) {
    prices[instrumentId] = decimalMoney(quote.price, 'quote price');
    const closingOn = calendarDate(quote.closingOn);
    if (!latestClosingOn || closingOn > latestClosingOn) latestClosingOn = closingOn;
  }
  return { prices, latestClosingOn };
}

function compareQuote(left: StoredPriceQuote, right: StoredPriceQuote): number {
  const closing = calendarDate(left.closingOn).localeCompare(calendarDate(right.closingOn));
  return closing || calendarDateTime(left.fetchedAt).localeCompare(calendarDateTime(right.fetchedAt));
}

function toAsset(instrument: StoredInstrument): Asset {
  const types: Record<string, InvestmentType> = { STOCK: 'stock', FII: 'fii', TREASURY: 'treasury' };
  const type = types[instrument.type];
  if (!type) throw new Error(`Unsupported instrument type: ${instrument.type}`);
  return { id: instrument.id, symbol: instrument.symbol, type };
}

function toDomainProfile(value: string): DomainProfileId {
  if (value === 'BIANCA' || value === 'bianca') return 'bianca';
  if (value === 'SERGIO' || value === 'sergio') return 'sergio';
  throw new Error(`Family cannot own an operation: ${value}`);
}

function requiredInstrument(operation: StoredOperation): StoredInstrument {
  if (!operation.instrument) throw new Error(`Operation ${operation.id} requires an instrument`);
  return operation.instrument;
}

function decimalMoney(value: DecimalLike | null, label: string): MoneyCents {
  if (!value) throw new Error(`Missing ${label}`);
  return decimalToCents(value.toString(), label);
}

/**
 * The domain deliberately represents displayed Brazilian real amounts in cents.
 * Quotes and operation requests may contain up to eight decimal places, so they
 * are converted with integer arithmetic and an explicit half-up policy instead
 * of ever passing through a JavaScript number.
 */
function decimalToCents(raw: string, label: string): MoneyCents {
  const match = /^(-?)(\d+)(?:\.(\d{1,8}))?$/.exec(raw);
  if (!match) throw new Error(`Invalid ${label}: ${raw}`);
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] ?? '0');
  const fraction = (match[3] ?? '').padEnd(8, '0');
  let cents = whole * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] !== undefined && fraction[2] >= '5') cents += 1n;
  return sign * cents;
}

function decimalQuantity(value: DecimalLike | null, label: string): bigint {
  if (!value) throw new Error(`Missing ${label}`);
  const raw = value.toString();
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) throw new Error(`Invalid ${label}: ${raw}`);
  const [integer, fraction = ''] = raw.split('.');
  return BigInt(integer) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function includesProfile(profile: AlexaProfile, owner: DomainProfileId): boolean {
  return profile === 'family' || profile === owner;
}

function stateFor(value: bigint): ResultState {
  return value > 0n ? 'positive' : value < 0n ? 'negative' : 'neutral';
}

function resultLabel(state: ResultState): string {
  return state === 'positive' ? 'Resultado positivo' : state === 'negative' ? 'Resultado negativo' : 'Sem variação';
}

function formatCurrency(cents: bigint, withSign = false): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const sign = negative ? '-' : withSign && cents > 0n ? '+' : '';
  return `${sign}R$ ${whole},${fraction}`;
}

function percentageLabel(part: bigint, total: bigint): string {
  return `${percentage(part, total)}%`;
}

function percentage(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 100n + total / 2n) / total);
}

function compareBigInt(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? 1 : -1;
}

function isMissingPriceError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Missing price for asset:');
}

function calendarDate(value: DateLike): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function calendarDateTime(value: DateLike): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
