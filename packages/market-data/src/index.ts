export type MarketInstrumentType = 'stock' | 'fii' | 'treasury';
export type PriceProviderName = 'brapi' | 'tesouro-direto-official';
export type MarketRunKind = 'after-open' | 'after-close';

export interface TrackedInstrument {
  readonly id: string;
  readonly symbol: string;
  readonly type: MarketInstrumentType;
}

export interface PriceSource {
  readonly provider: PriceProviderName;
  /** Configured endpoint actually queried, without query-string credentials. */
  readonly endpoint: string;
  readonly retrievedAt: string;
  /** The date declared by the upstream record, not the local fetch date. */
  readonly publishedOn: string;
}

export interface EodQuote {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly type: MarketInstrumentType;
  /** Brazilian reais expressed as a canonical decimal string, e.g. 32.50. */
  readonly closingPrice: string;
  /** ISO market date (YYYY-MM-DD). */
  readonly quotedOn: string;
  readonly source: PriceSource;
}

/**
 * Persistence belongs to the API/database layer. Its upsert must be idempotent
 * on (instrumentId, quotedOn, source.provider), and must never delete a prior
 * valid quote while an ingestion run fails.
 */
export interface MarketPriceRepository {
  listTrackedInstruments(): Promise<readonly TrackedInstrument[]>;
  upsertEodQuote(quote: EodQuote): Promise<'inserted' | 'unchanged' | 'updated'>;
  recordIngestionRun(run: IngestionRunRecord): Promise<void>;
}

export interface IngestionRunRecord {
  readonly idempotencyKey: string;
  readonly kind: MarketRunKind;
  readonly quotedOn: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: 'succeeded' | 'partial' | 'failed';
  readonly inserted: number;
  readonly unchanged: number;
  readonly updated: number;
  readonly rejected: number;
  readonly failures: readonly IngestionFailure[];
}

export interface IngestionFailure {
  readonly provider: PriceProviderName;
  readonly message: string;
  readonly retryable: boolean;
}

export interface QuoteProvider {
  readonly name: PriceProviderName;
  fetchEodQuotes(input: QuoteFetchInput): Promise<readonly ProviderQuote[]>;
}

export interface QuoteFetchInput {
  readonly instruments: readonly TrackedInstrument[];
  readonly quotedOn: string;
}

export interface ProviderQuote {
  readonly symbol: string;
  readonly closingPrice: string;
  readonly quotedOn: string;
  readonly publishedOn: string;
}

export class MarketDataError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'MarketDataError';
  }
}

export interface RetryPolicy {
  readonly attempts: number;
  readonly delayMs: number;
}

export const defaultRetryPolicy: RetryPolicy = { attempts: 3, delayMs: 250 };

export async function withRetry<T>(
  action: () => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy,
  sleep: (milliseconds: number) => Promise<void> = delay,
): Promise<T> {
  if (!Number.isInteger(policy.attempts) || policy.attempts < 1 || policy.delayMs < 0) {
    throw new Error('invalid retry policy');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof MarketDataError ? error.retryable : true;
      if (!retryable || attempt === policy.attempts) break;
      await sleep(policy.delayMs * attempt);
    }
  }
  throw lastError;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export interface HttpClient {
  fetch(
    input: string,
    init?: { readonly headers?: Readonly<Record<string, string>> },
  ): Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;
}

export interface ConfiguredEndpoint {
  /** Endpoint template. It may use {date} and {symbols}; it must be an HTTPS URL. */
  readonly urlTemplate: string;
}

/**
 * Expected response body from the configured B3 or Tesouro endpoint.
 * The endpoint adapter is deliberately strict so a provider format change fails
 * safely instead of persisting guessed numbers.
 */
export interface EndpointQuoteResponse {
  readonly quotes: readonly {
    readonly symbol: string;
    readonly closingPrice: string | number;
    readonly quotedOn: string;
    readonly publishedOn?: string;
  }[];
}

abstract class ConfiguredJsonQuoteProvider implements QuoteProvider {
  abstract readonly name: PriceProviderName;
  readonly sourceEndpoint: string;

  constructor(
    private readonly endpoint: ConfiguredEndpoint,
    private readonly client: HttpClient,
  ) {
    validateEndpointTemplate(endpoint.urlTemplate);
    this.sourceEndpoint = endpointForMetadata(endpoint.urlTemplate);
  }

  async fetchEodQuotes(input: QuoteFetchInput): Promise<readonly ProviderQuote[]> {
    const url = buildEndpointUrl(this.endpoint.urlTemplate, input);
    let response: { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };
    try {
      response = await this.client.fetch(url);
    } catch (cause) {
      throw new MarketDataError(`${this.name} endpoint request failed: ${messageOf(cause)}`, true);
    }
    if (!response.ok) {
      throw new MarketDataError(`${this.name} endpoint returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new MarketDataError(`${this.name} endpoint returned invalid JSON: ${messageOf(cause)}`, false);
    }
    return parseEndpointQuoteResponse(body, this.name);
  }
}

/**
 * Brapi returns its own response shape, so it is an explicit adapter rather
 * than a user-configured URL template. The key stays in an HTTP header.
 */
export class BrapiQuoteProvider implements QuoteProvider {
  readonly name = 'brapi' as const;
  readonly sourceEndpoint = 'https://brapi.dev/api/quote';

  constructor(
    private readonly apiKey: string,
    private readonly client: HttpClient,
  ) {
    if (apiKey.trim().length < 8) throw new Error('BRAPI_API_KEY must be configured');
  }

  async fetchEodQuotes(input: QuoteFetchInput): Promise<readonly ProviderQuote[]> {
    if (input.instruments.length === 0) return [];
    const symbols = input.instruments.map((instrument) => instrument.symbol).join(',');
    let response: { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };
    try {
      response = await this.client.fetch(`${this.sourceEndpoint}/${encodeURIComponent(symbols)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
    } catch (cause) {
      throw new MarketDataError(`brapi endpoint request failed: ${messageOf(cause)}`, true);
    }
    if (!response.ok) {
      throw new MarketDataError(`brapi endpoint returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new MarketDataError(`brapi endpoint returned invalid JSON: ${messageOf(cause)}`, false);
    }
    return parseBrapiQuoteResponse(body, input);
  }
}

export class TesouroDiretoOfficialQuoteProvider extends ConfiguredJsonQuoteProvider {
  readonly name = 'tesouro-direto-official' as const;
}

export interface MarketIngestionEnvironment {
  readonly BRAPI_API_KEY?: string;
  readonly MARKET_TESOURO_EOD_URL?: string;
}

export interface CreateConfiguredMarketIngestionWorkerInput {
  readonly repository: MarketPriceRepository;
  readonly environment: MarketIngestionEnvironment;
  readonly httpClient?: HttpClient;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * Wires only approved, deployment-configured endpoints. The caller supplies
 * persistence, so this package remains independent of a specific database.
 */
export function createConfiguredMarketIngestionWorker(
  input: CreateConfiguredMarketIngestionWorkerInput,
): MarketIngestionWorker {
  const httpClient = input.httpClient ?? globalThis;

  return new MarketIngestionWorker({
    repository: input.repository,
    b3Provider: input.environment.BRAPI_API_KEY
      ? new BrapiQuoteProvider(input.environment.BRAPI_API_KEY, httpClient)
      : new UnconfiguredQuoteProvider('brapi', 'BRAPI_API_KEY'),
    treasuryProvider: input.environment.MARKET_TESOURO_EOD_URL
      ? new TesouroDiretoOfficialQuoteProvider(
        { urlTemplate: requiredEndpoint(input.environment.MARKET_TESOURO_EOD_URL, 'MARKET_TESOURO_EOD_URL') },
        httpClient,
      )
      : new UnconfiguredQuoteProvider('tesouro-direto-official', 'MARKET_TESOURO_EOD_URL'),
    retryPolicy: input.retryPolicy,
  });
}

export interface MarketIngestionWorkerOptions {
  readonly repository: MarketPriceRepository;
  readonly b3Provider: QuoteProvider;
  readonly treasuryProvider: QuoteProvider;
  readonly retryPolicy?: RetryPolicy;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class MarketIngestionWorker {
  private readonly retryPolicy: RetryPolicy;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: MarketIngestionWorkerOptions) {
    this.retryPolicy = options.retryPolicy ?? defaultRetryPolicy;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? delay;
  }

  async run(kind: MarketRunKind, quotedOn: string): Promise<IngestionRunRecord> {
    assertIsoDate(quotedOn, 'quotedOn');
    const startedAt = this.now().toISOString();
    const instruments = await this.options.repository.listTrackedInstruments();
    const providerInputs: readonly [QuoteProvider, readonly TrackedInstrument[]][] = [
      [this.options.b3Provider, instruments.filter((instrument) => instrument.type === 'stock' || instrument.type === 'fii')],
      [this.options.treasuryProvider, instruments.filter((instrument) => instrument.type === 'treasury')],
    ];
    const failures: IngestionFailure[] = [];
    let inserted = 0;
    let unchanged = 0;
    let updated = 0;
    let rejected = 0;

    for (const [provider, requestedInstruments] of providerInputs) {
      if (requestedInstruments.length === 0) continue;
      try {
        const result = await withRetry(
          () => provider.fetchEodQuotes({ instruments: requestedInstruments, quotedOn }),
          this.retryPolicy,
          this.sleep,
        );
        const bySymbol = new Map(requestedInstruments.map((instrument) => [instrument.symbol.toUpperCase(), instrument]));
        for (const rawQuote of result) {
          const instrument = bySymbol.get(rawQuote.symbol.toUpperCase());
          if (!instrument || rawQuote.quotedOn !== quotedOn || !isValidPrice(rawQuote.closingPrice) || !isIsoDate(rawQuote.quotedOn) || !isIsoDate(rawQuote.publishedOn)) {
            rejected += 1;
            continue;
          }
          const outcome = await this.options.repository.upsertEodQuote({
            instrumentId: instrument.id,
            symbol: instrument.symbol,
            type: instrument.type,
            closingPrice: canonicalPrice(rawQuote.closingPrice),
            quotedOn: rawQuote.quotedOn,
            source: {
              provider: provider.name,
              endpoint: configuredEndpointFor(provider),
              retrievedAt: this.now().toISOString(),
              publishedOn: rawQuote.publishedOn,
            },
          });
          if (outcome === 'inserted') inserted += 1;
          if (outcome === 'unchanged') unchanged += 1;
          if (outcome === 'updated') updated += 1;
        }
      } catch (cause) {
        failures.push({
          provider: provider.name,
          message: messageOf(cause),
          retryable: cause instanceof MarketDataError ? cause.retryable : true,
        });
      }
    }

    const status = failures.length === 0 ? 'succeeded' : inserted + unchanged + updated + rejected > 0 ? 'partial' : 'failed';
    const run: IngestionRunRecord = {
      idempotencyKey: `market:${kind}:${quotedOn}`,
      kind,
      quotedOn,
      startedAt,
      completedAt: this.now().toISOString(),
      status,
      inserted,
      unchanged,
      updated,
      rejected,
      failures,
    };
    await this.options.repository.recordIngestionRun(run);
    return run;
  }
}

class UnconfiguredQuoteProvider implements QuoteProvider {
  constructor(
    readonly name: PriceProviderName,
    private readonly configurationName: string,
  ) {}

  async fetchEodQuotes(): Promise<readonly ProviderQuote[]> {
    throw new MarketDataError(`${this.configurationName} is not configured`, false);
  }
}

/** A provider may expose its public endpoint for persisted source provenance. */
export interface EndpointAwareQuoteProvider extends QuoteProvider {
  readonly sourceEndpoint: string;
}

function configuredEndpointFor(provider: QuoteProvider): string {
  return 'sourceEndpoint' in provider && typeof provider.sourceEndpoint === 'string'
    ? provider.sourceEndpoint
    : 'injected-fixture';
}

function requiredEndpoint(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be configured with an approved HTTPS endpoint`);
  return value;
}

export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export interface LocalScheduleDefinition {
  readonly name: MarketRunKind;
  readonly timeZone: typeof SAO_PAULO_TIME_ZONE;
  readonly localTime: string;
  /** Standard five-field cron expression, evaluated in timeZone. */
  readonly cron: string;
  readonly weekdaysOnly: true;
}

export const MARKET_INGESTION_SCHEDULES: readonly LocalScheduleDefinition[] = [
  { name: 'after-open', timeZone: SAO_PAULO_TIME_ZONE, localTime: '12:00', cron: '0 12 * * 1-5', weekdaysOnly: true },
  { name: 'after-close', timeZone: SAO_PAULO_TIME_ZONE, localTime: '19:00', cron: '0 19 * * 1-5', weekdaysOnly: true },
];

export function parseEndpointQuoteResponse(input: unknown, provider: PriceProviderName): readonly ProviderQuote[] {
  if (!isRecord(input) || !Array.isArray(input.quotes)) {
    throw new MarketDataError(`${provider} response must contain a quotes array`, false);
  }
  return input.quotes.map((quote, index) => {
    if (!isRecord(quote) || typeof quote.symbol !== 'string' ||
      (typeof quote.closingPrice !== 'string' && typeof quote.closingPrice !== 'number') ||
      typeof quote.quotedOn !== 'string' || (quote.publishedOn !== undefined && typeof quote.publishedOn !== 'string')) {
      throw new MarketDataError(`${provider} response contains an invalid quote at index ${index}`, false);
    }
    const closingPrice = String(quote.closingPrice);
    const publishedOn = quote.publishedOn ?? quote.quotedOn;
    if (!isValidPrice(closingPrice) || !isIsoDate(quote.quotedOn) || !isIsoDate(publishedOn)) {
      throw new MarketDataError(`${provider} response contains an invalid quote value at index ${index}`, false);
    }
    return { symbol: quote.symbol.trim().toUpperCase(), closingPrice: canonicalPrice(closingPrice), quotedOn: quote.quotedOn, publishedOn };
  });
}

function parseBrapiQuoteResponse(input: unknown, request: QuoteFetchInput): readonly ProviderQuote[] {
  if (!isRecord(input) || !Array.isArray(input.results)) {
    throw new MarketDataError('brapi response must contain a results array', false);
  }

  const expectedSymbols = new Set(request.instruments.map((instrument) => instrument.symbol.toUpperCase()));
  const quotes: ProviderQuote[] = [];
  for (const raw of input.results) {
    if (!isRecord(raw) || typeof raw.symbol !== 'string' ||
      (typeof raw.regularMarketPrice !== 'string' && typeof raw.regularMarketPrice !== 'number')) {
      throw new MarketDataError('brapi response contains an invalid quote', false);
    }
    const symbol = raw.symbol.trim().toUpperCase();
    const closingPrice = String(raw.regularMarketPrice);
    if (!expectedSymbols.has(symbol) || !isValidPrice(closingPrice)) {
      throw new MarketDataError('brapi response contains an invalid quote value', false);
    }
    const publishedOn = typeof raw.regularMarketTime === 'string' && isIsoDate(raw.regularMarketTime.slice(0, 10))
      ? raw.regularMarketTime.slice(0, 10)
      : request.quotedOn;
    quotes.push({ symbol, closingPrice: canonicalPrice(closingPrice), quotedOn: request.quotedOn, publishedOn });
  }
  if (quotes.length !== expectedSymbols.size) {
    throw new MarketDataError('brapi response is missing one or more requested symbols', false);
  }
  return quotes;
}

function buildEndpointUrl(template: string, input: QuoteFetchInput): string {
  return template
    .replaceAll('{date}', encodeURIComponent(input.quotedOn))
    .replaceAll('{symbols}', encodeURIComponent(input.instruments.map((instrument) => instrument.symbol).join(',')));
}

function validateEndpointTemplate(template: string): void {
  let url: URL;
  try {
    url = new URL(template.replaceAll('{date}', '2026-01-01').replaceAll('{symbols}', 'PETR4'));
  } catch {
    throw new Error('market data endpoint must be an absolute URL');
  }
  if (url.protocol !== 'https:') throw new Error('market data endpoint must use HTTPS');
}

function endpointForMetadata(template: string): string {
  const url = new URL(template.replaceAll('{date}', '2026-01-01').replaceAll('{symbols}', 'PETR4'));
  return `${url.origin}${url.pathname}`;
}

function isValidPrice(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value) && Number(value) > 0;
}

function canonicalPrice(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function assertIsoDate(value: string, field: string): void {
  if (!isIsoDate(value)) throw new Error(`${field} must be an ISO calendar date`);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
