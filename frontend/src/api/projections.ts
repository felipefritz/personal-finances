import apiClient from './client';
import type { AnnualProjection } from '../types';

export const getAnnualProjection = async (
  year?: number,
  accountId?: number,
): Promise<AnnualProjection> => {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  if (accountId) params.account_id = accountId;
  const { data } = await apiClient.get('/projections/annual', { params });
  return data;
};
