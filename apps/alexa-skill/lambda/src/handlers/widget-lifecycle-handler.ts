import { getRequestType, RequestHandler } from 'ask-sdk-core';

const widgetRequestTypes = new Set([
  'Alexa.DataStore.PackageManager.UsagesInstalled',
  'Alexa.DataStore.PackageManager.UsagesRemoved',
  'Alexa.DataStore.PackageManager.UpdateRequest',
  'Alexa.DataStore.PackageManager.InstallationError',
  'Alexa.DataStore.DataStoreError'
]);

/**
 * Device identifiers are not persisted by the Skill. The scheduled backend job
 * owns Data Store updates once it receives the device installation association.
 */
export const WidgetLifecycleHandler: RequestHandler = {
  canHandle(input) {
    return widgetRequestTypes.has(getRequestType(input.requestEnvelope));
  },
  handle(input) {
    const requestType = getRequestType(input.requestEnvelope);

    // Enable this only during the one-time publisher setup. Device/user IDs are
    // personal data; copy the skill-scoped ID to protected configuration and
    // turn the flag off immediately afterwards.
    if (process.env.ALEXA_WIDGET_ASSOCIATION_LOG_ENABLED === 'true') {
      const system = input.requestEnvelope.context.System;
      console.info('Widget lifecycle association', {
        requestType,
        deviceId: system.device?.deviceId,
        userId: system.user.userId
      });
    } else {
      console.info('Received widget lifecycle event', requestType);
    }

    return input.responseBuilder.getResponse();
  }
};
