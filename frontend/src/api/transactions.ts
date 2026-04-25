import apiClient from './client';
import type { Transaction, TransactionListResponse, TransactionFilters } from '../types';

export const getTransactions = async (filters: TransactionFilters = {}): Promise<TransactionListResponse> => {
  const params: Record<string, unknown> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params[k] = v;
  });
  const { data } = await apiClient.get('/transactions/', { params });
  return data;
};

export const getTransaction = async (id: number): Promise<Transaction> => {
  const { data } = await apiClient.get(`/transactions/${id}`);
  return data;
};

export const createTransaction = async (payload: Partial<Transaction>): Promise<Transaction> => {
  const { data } = await apiClient.post('/transactions/', payload);
  return data;
};

export const updateTransaction = async (id: number, payload: Partial<Transaction>): Promise<Transaction> => {
  const { data } = await apiClient.patch(`/transactions/${id}`, payload);
  return data;
};

export const deleteTransaction = async (id: number): Promise<void> => {
  await apiClient.delete(`/transactions/${id}`);
};

export const autoCategorize = async (id: number): Promise<Transaction> => {
  const { data } = await apiClient.post(`/transactions/${id}/categorize`);
  return data;
};
