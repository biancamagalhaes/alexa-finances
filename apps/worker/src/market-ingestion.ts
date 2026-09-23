import {
  createConfiguredMarketIngestionWorker,
  type CreateConfiguredMarketIngestionWorkerInput,
  type MarketIngestionEnvironment,
  type MarketRunKind,
} from '@alexa-finances/market-data';

export type WorkerEnvironment = MarketIngestionEnvironment;
export type CreateMarketIngestionWorkerInput = CreateConfiguredMarketIngestionWorkerInput;

export const createMarketIngestionWorker = createConfiguredMarketIngestionWorker;

export async function runConfiguredMarketIngestion(
  input: CreateMarketIngestionWorkerInput & { readonly kind: MarketRunKind; readonly quotedOn: string },
) {
  return createConfiguredMarketIngestionWorker(input).run(input.kind, input.quotedOn);
}
