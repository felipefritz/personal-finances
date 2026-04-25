import apiClient from './client';
import type { Budget, BudgetRecommendation } from '../types';

export const getBudgets = async (month?: number, year?: number): Promise<Budget[]> => {
  const params: Record<string, number> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const { data } = await apiClient.get('/budgets/', { params });
  return data;
};

export const getBudget = async (id: number): Promise<Budget> => {
  const { data } = await apiClient.get(`/budgets/${id}`);
  return data;
};

export const createBudget = async (payload: Partial<Budget>): Promise<Budget> => {
  const { data } = await apiClient.post('/budgets/', payload);
  return data;
};

export const updateBudget = async (id: number, payload: Partial<Budget>): Promise<Budget> => {
  const { data } = await apiClient.patch(`/budgets/${id}`, payload);
  return data;
};

export const deleteBudget = async (id: number): Promise<void> => {
  await apiClient.delete(`/budgets/${id}`);
};

export const getBudgetRecommendations = async (month: number, year: number): Promise<BudgetRecommendation> => {
  const { data } = await apiClient.get('/budgets/recommendations', { params: { month, year } });
  return data;
};

export const applyBudgetRecommendations = async (
  month: number,
  year: number
): Promise<{ created: number; updated: number; skipped: number }> => {
  const { data } = await apiClient.post('/budgets/recommendations/apply', null, { params: { month, year } });
  return data;
};
