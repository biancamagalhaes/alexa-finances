export const profiles = ['bianca', 'sergio', 'family'] as const;

export type ProfileId = (typeof profiles)[number];
export type ResultState = 'positive' | 'negative' | 'neutral';

export interface PortfolioView {
  profile: {
    id: ProfileId;
    label: 'Bianca' | 'Sergio' | 'Família';
  };
  asOfLabel: string;
  resultState: ResultState;
  resultLabel: string;
  allocation: Array<{
    label: string;
    percentageLabel: string;
  }>;
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

export interface PortfolioApi {
  getView(profile: ProfileId): Promise<PortfolioView>;
  getVoiceStatus(profile: ProfileId): Promise<VoiceStatus>;
}

export const profileLabels: Record<ProfileId, PortfolioView['profile']['label']> = {
  bianca: 'Bianca',
  sergio: 'Sergio',
  family: 'Família'
};

export function parseProfile(value: string | undefined): ProfileId {
  const normalized = value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (normalized === 'bianca') return 'bianca';
  if (normalized === 'sergio') return 'sergio';
  return 'family';
}
