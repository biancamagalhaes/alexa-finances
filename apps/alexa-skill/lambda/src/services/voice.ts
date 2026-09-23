import { ProfileId, profileLabels, VoiceStatus } from '../types/portfolio';

/**
 * Voice responses are intentionally assembled from this allowlist instead of
 * interpolating backend fields. This makes an unexpected API payload unable to
 * disclose money, quantities, prices, percentages, dates, or asset tickers.
 */
const safeResultStates = new Set(['positive', 'negative', 'neutral']);

const allocationLabels: Record<string, string> = {
  acoes: 'ações',
  fii: 'FIIs',
  fiis: 'FIIs',
  tesouro: 'Tesouro Direto',
  caixa: 'caixa'
};

function safeResultState(status: VoiceStatus): 'positive' | 'negative' | 'neutral' {
  return safeResultStates.has(status.resultState) ? status.resultState : 'neutral';
}

function safeAllocationLabel(status: VoiceStatus): string | null {
  if (typeof status.largestAllocationLabel !== 'string') return null;

  const normalized = status.largestAllocationLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return allocationLabels[normalized] ?? null;
}

export function statusSpeech(profile: ProfileId, status: VoiceStatus): string {
  const profileLabel = profileLabels[profile];
  const resultState = safeResultState(status);

  if (resultState === 'positive') {
    return `O resultado da carteira ${profileLabel} está positivo. Toque na tela para ver os detalhes.`;
  }

  if (resultState === 'negative') {
    return `O resultado da carteira ${profileLabel} está negativo. Toque na tela para ver os detalhes.`;
  }

  return `A carteira ${profileLabel} está estável. Toque na tela para ver os detalhes.`;
}

export function breakdownSpeech(profile: ProfileId, status: VoiceStatus): string {
  const allocationLabel = safeAllocationLabel(status);

  if (allocationLabel) {
    return `A maior classe da carteira ${profileLabels[profile]} é ${allocationLabel}. Toque na tela para ver a composição.`;
  }

  return `A composição da carteira ${profileLabels[profile]} está disponível na tela.`;
}
