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
  const aplSupported = supportsApl(input);
  const viewports = input.requestEnvelope.context.Viewports?.map((viewport) => viewport.id) ?? [];
  console.info('APL render decision', {
    aplSupported,
    viewports,
    profile: portfolio.profile.id
  });

  if (!aplSupported) return;

  input.responseBuilder.addDirective({
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: DETAIL_TOKEN,
    document: detailDocument,
    datasources: {
      portfolio
    }
  });
}
