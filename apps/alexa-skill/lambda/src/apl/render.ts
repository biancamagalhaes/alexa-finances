import { HandlerInput } from 'ask-sdk-core';
import detailDocument from './detail-document.json';
import { PortfolioView } from '../types/portfolio';

export const DETAIL_TOKEN = 'portfolio-detail';

export function supportsApl(input: HandlerInput): boolean {
  return Boolean(
    input.requestEnvelope.context.System.device?.supportedInterfaces?.['Alexa.Presentation.APL']
  );
}

export function addPortfolioDocument(input: HandlerInput, portfolio: PortfolioView): void {
  if (!supportsApl(input)) return;

  input.responseBuilder.addDirective({
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: DETAIL_TOKEN,
    document: detailDocument,
    datasources: {
      payload: { portfolio }
    }
  });
}
