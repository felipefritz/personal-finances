import apiClient from './client';
import type { DashboardSummary } from '../types';

export const getDashboardSummary = async (month?: number, year?: number): Promise<DashboardSummary> => {
  const params: Record<string, number> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const { data } = await apiClient.get('/dashboard/summary', { params });
  return data;
};
