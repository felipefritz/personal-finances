import apiClient from './client';
import type { FixedExpense } from '../types';

export const getFixedExpenses = async (): Promise<FixedExpense[]> => {
  const { data } = await apiClient.get('/fixed-expenses/');
  return data;
};

export const getFixedExpense = async (id: number): Promise<FixedExpense> => {
  const { data } = await apiClient.get(`/fixed-expenses/${id}`);
  return data;
};

export const createFixedExpense = async (payload: Partial<FixedExpense>): Promise<FixedExpense> => {
  const { data } = await apiClient.post('/fixed-expenses/', payload);
  return data;
};

export const updateFixedExpense = async (id: number, payload: Partial<FixedExpense>): Promise<FixedExpense> => {
  const { data } = await apiClient.patch(`/fixed-expenses/${id}`, payload);
  return data;
};

export const deleteFixedExpense = async (id: number): Promise<void> => {
  await apiClient.delete(`/fixed-expenses/${id}`);
};
