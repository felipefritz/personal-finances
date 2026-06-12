import apiClient from './client';
import type {
  SavingsAnnualProjection,
  SavingsDistributionPlan,
  SavingsGoal,
  SavingsGoalPlanInput,
  SavingsGoalPlanPreview,
} from '../types';

export const getSavingsGoals = async (): Promise<SavingsGoal[]> => {
  const { data } = await apiClient.get('/savings-goals/');
  return data;
};

export const getSavingsGoal = async (id: number): Promise<SavingsGoal> => {
  const { data } = await apiClient.get(`/savings-goals/${id}`);
  return data;
};

export const createSavingsGoal = async (payload: Partial<SavingsGoal>): Promise<SavingsGoal> => {
  const { data } = await apiClient.post('/savings-goals/', payload);
  return data;
};

export const updateSavingsGoal = async (id: number, payload: Partial<SavingsGoal>): Promise<SavingsGoal> => {
  const { data } = await apiClient.patch(`/savings-goals/${id}`, payload);
  return data;
};

export const deleteSavingsGoal = async (id: number): Promise<void> => {
  await apiClient.delete(`/savings-goals/${id}`);
};

export const getSavingsGoalPlan = async (payload: SavingsGoalPlanInput): Promise<SavingsGoalPlanPreview> => {
  const { data } = await apiClient.post('/savings-goals/plan', payload);
  return data;
};

export const getSavingsDistributionPlan = async (): Promise<SavingsDistributionPlan> => {
  const { data } = await apiClient.get('/savings-goals/distribution-plan');
  return data;
};

export const getSavingsAnnualProjection = async (
  startDate?: string,
  endDate?: string,
): Promise<SavingsAnnualProjection> => {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  const { data } = await apiClient.get('/savings-goals/annual-projection', { params });
  return data;
};
