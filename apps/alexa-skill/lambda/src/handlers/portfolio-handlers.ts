import {
  getIntentName,
  getRequestType,
  HandlerInput,
  RequestHandler
} from 'ask-sdk-core';
import { addPortfolioDocument } from '../apl/render';
import { portfolioApi } from '../services/portfolio-api';
import { breakdownSpeech, statusSpeech } from '../services/voice';
import { parseProfile, ProfileId } from '../types/portfolio';

const defaultProfile: ProfileId = 'family';

function activeProfile(input: HandlerInput): ProfileId {
  return parseProfile(input.attributesManager.getSessionAttributes().profile);
}

function setActiveProfile(input: HandlerInput, profile: ProfileId): void {
  input.attributesManager.setSessionAttributes({
    ...input.attributesManager.getSessionAttributes(),
    profile
  });
}

/**
 * A fresh RenderDocument initializes its APL `showValues` binding as false.
 * Profile switches and detail navigation therefore never carry a prior local
 * reveal state to the next view.
 */
async function renderMasked(input: HandlerInput, profile: ProfileId): Promise<void> {
  addPortfolioDocument(input, await portfolioApi.getView(profile));
}

export const LaunchRequestHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  async handle(input) {
    const profile = activeProfile(input) ?? defaultProfile;
    setActiveProfile(input, profile);
    await renderMasked(input, profile);

    return input.responseBuilder
      .speak('Sua carteira está pronta. Os valores ficam ocultos até você tocar no olho na tela.')
      .reprompt('O que você quer consultar na sua carteira?')
      .getResponse();
  }
};

export const OpenPortfolioIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && getIntentName(input.requestEnvelope) === 'OpenPortfolioIntent';
  },
  async handle(input) {
    const profile = activeProfile(input);
    await renderMasked(input, profile);
    return input.responseBuilder
      .speak('Abri sua carteira. Os valores ficam ocultos até você tocar no olho na tela.')
      .reprompt('O que você quer consultar na sua carteira?')
      .getResponse();
  }
};

export const SelectProfileIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && getIntentName(input.requestEnvelope) === 'SelectProfileIntent';
  },
  async handle(input) {
    const request = input.requestEnvelope.request;
    const slot = request.type === 'IntentRequest' ? request.intent.slots?.profile?.value : undefined;
    const profile = parseProfile(slot);
    setActiveProfile(input, profile);
    await renderMasked(input, profile);
    return input.responseBuilder
      .speak('Perfil atualizado. Os valores ficam ocultos até você tocar no olho na tela.')
      .reprompt('O que você quer consultar nessa carteira?')
      .getResponse();
  }
};

export const PortfolioStatusIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && getIntentName(input.requestEnvelope) === 'PortfolioStatusIntent';
  },
  async handle(input) {
    const profile = activeProfile(input);
    const [status, view] = await Promise.all([
      portfolioApi.getVoiceStatus(profile),
      portfolioApi.getView(profile)
    ]);
    addPortfolioDocument(input, view);
    return input.responseBuilder.speak(statusSpeech(profile, status)).getResponse();
  }
};

export const PortfolioBreakdownIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && getIntentName(input.requestEnvelope) === 'PortfolioBreakdownIntent';
  },
  async handle(input) {
    const profile = activeProfile(input);
    const [status, view] = await Promise.all([
      portfolioApi.getVoiceStatus(profile),
      portfolioApi.getView(profile)
    ]);
    addPortfolioDocument(input, view);
    return input.responseBuilder.speak(breakdownSpeech(profile, status)).getResponse();
  }
};

export const UserEventHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'Alexa.Presentation.APL.UserEvent';
  },
  async handle(input) {
    const request = input.requestEnvelope.request as unknown as { arguments?: unknown[] };
    const [action, profileValue] = request.arguments ?? [];

    if (action === 'select-profile' || action === 'show-details') {
      const profile = parseProfile(typeof profileValue === 'string' ? profileValue : activeProfile(input));
      setActiveProfile(input, profile);
      await renderMasked(input, profile);
      return input.responseBuilder.getResponse();
    }

    return input.responseBuilder.getResponse();
  }
};

export const HelpIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && getIntentName(input.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(input) {
    return input.responseBuilder
      .speak('Você pode pedir para abrir a carteira ou escolher Bianca, Sergio ou Família.')
      .reprompt('Qual carteira você quer consultar?')
      .getResponse();
  }
};

export const CancelAndStopIntentHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(getIntentName(input.requestEnvelope));
  },
  handle(input) {
    return input.responseBuilder.speak('Até logo.').getResponse();
  }
};

export const SessionEndedRequestHandler: RequestHandler = {
  canHandle(input) {
    return getRequestType(input.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(input) {
    return input.responseBuilder.getResponse();
  }
};
