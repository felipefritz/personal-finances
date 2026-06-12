import apiClient from './client';

export interface ExchangeRatesResponse {
  USD?: number;
  UF?: number;
  USD_prev?: number;
  UF_prev?: number;
  [key: string]: number | undefined;
}

export const getExchangeRates = async (): Promise<ExchangeRatesResponse> => {
  const { data } = await apiClient.get('/exchange-rates/');
  return data;
};
