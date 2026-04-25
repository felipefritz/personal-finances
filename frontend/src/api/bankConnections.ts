import apiClient from './client';
import type { BankConnection, FintocConnectResponse } from '../types';

export const getBankConnections = async (): Promise<BankConnection[]> => {
  const { data } = await apiClient.get('/bank-connections/');
  return data;
};

export const createBankConnection = async (
  payload: Partial<BankConnection>
): Promise<BankConnection> => {
  const { data } = await apiClient.post('/bank-connections/', payload);
  return data;
};

export const deleteBankConnection = async (id: number): Promise<void> => {
  await apiClient.delete(`/bank-connections/${id}`);
};

export const connectFintoc = async (
  linkToken: string,
  accountId?: number
): Promise<FintocConnectResponse> => {
  const { data } = await apiClient.post('/bank-connections/fintoc/connect', {
    link_token: linkToken,
    account_id: accountId,
  });
  return data;
};

export const syncFintocConnection = async (
  connectionId: number,
  accountId: number
): Promise<{ synced_count: number; connection_id: number; note: string }> => {
  const { data } = await apiClient.post(`/bank-connections/fintoc/sync`, {
    connection_id: connectionId,
    account_id: accountId,
  });
  return data;
};
