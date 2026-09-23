import { PortfolioApi, PortfolioView, ProfileId, VoiceStatus } from '../types/portfolio';

const baseUrl = process.env.PORTFOLIO_API_BASE_URL;
const token = process.env.PORTFOLIO_API_TOKEN;

function getHeaders(): HeadersInit {
  if (!token) {
    throw new Error('PORTFOLIO_API_TOKEN is not configured');
  }
  return {
    Accept: 'application/json',
    'X-API-Key': token,
  };
}

async function request<T>(path: string): Promise<T> {
  if (!baseUrl) {
    throw new Error('PORTFOLIO_API_BASE_URL is not configured');
  }

  const response = await fetch(new URL(path, baseUrl), { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`Portfolio API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const portfolioApi: PortfolioApi = {
  getView(profile: ProfileId): Promise<PortfolioView> {
    return request(`/v1/alexa/portfolio-view?profile=${profile}`);
  },
  getVoiceStatus(profile: ProfileId): Promise<VoiceStatus> {
    return request(`/v1/alexa/voice-status?profile=${profile}`);
  }
};
