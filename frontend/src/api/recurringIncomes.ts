import apiClient from './client';
import type { RecurringIncome } from '../types';

export const getRecurringIncomes = async (): Promise<RecurringIncome[]> => {
  const { data } = await apiClient.get('/recurring-incomes/');
  return data;
};

export const createRecurringIncome = async (payload: Partial<RecurringIncome>): Promise<RecurringIncome> => {
  const { data } = await apiClient.post('/recurring-incomes/', payload);
  return data;
};

export const updateRecurringIncome = async (id: number, payload: Partial<RecurringIncome>): Promise<RecurringIncome> => {
  const { data } = await apiClient.patch(`/recurring-incomes/${id}`, payload);
  return data;
};

export const deleteRecurringIncome = async (id: number): Promise<void> => {
  await apiClient.delete(`/recurring-incomes/${id}`);
};
