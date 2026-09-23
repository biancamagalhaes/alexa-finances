import { ErrorHandler, SkillBuilders } from 'ask-sdk-core';
import {
  CancelAndStopIntentHandler,
  HelpIntentHandler,
  LaunchRequestHandler,
  OpenPortfolioIntentHandler,
  PortfolioBreakdownIntentHandler,
  PortfolioStatusIntentHandler,
  SelectProfileIntentHandler,
  SessionEndedRequestHandler,
  UserEventHandler
} from './handlers/portfolio-handlers';
import { WidgetLifecycleHandler } from './handlers/widget-lifecycle-handler';

const ErrorHandler: ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(input, error) {
    console.error('Unhandled Alexa request', error);
    return input.responseBuilder
      .speak('Não consegui atualizar sua carteira agora. Tente novamente em instantes.')
      .reprompt('Tente abrir sua carteira novamente.')
      .getResponse();
  }
};

export const handler = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    OpenPortfolioIntentHandler,
    SelectProfileIntentHandler,
    PortfolioStatusIntentHandler,
    PortfolioBreakdownIntentHandler,
    UserEventHandler,
    WidgetLifecycleHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
