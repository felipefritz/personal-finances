import apiClient from './client';
import type { Account } from '../types';

export const getAccounts = async (): Promise<Account[]> => {
  const { data } = await apiClient.get('/accounts/');
  return data;
};

export const getAccount = async (id: number): Promise<Account> => {
  const { data } = await apiClient.get(`/accounts/${id}`);
  return data;
};

export const createAccount = async (payload: Partial<Account>): Promise<Account> => {
  const { data } = await apiClient.post('/accounts/', payload);
  return data;
};

export const updateAccount = async (id: number, payload: Partial<Account>): Promise<Account> => {
  const { data } = await apiClient.patch(`/accounts/${id}`, payload);
  return data;
};

export const deleteAccount = async (id: number): Promise<void> => {
  await apiClient.delete(`/accounts/${id}`);
};
