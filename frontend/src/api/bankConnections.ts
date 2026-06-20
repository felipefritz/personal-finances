import apiClient from './client';
import type {
  BankConnection,
  BankProvider,
  BankSyncResponse,
  ScrapedProviderAccount,
} from '../types';

export const getBankProviders = async (): Promise<BankProvider[]> => {
  const { data } = await apiClient.get('/bank-connections/providers');
  return data.providers ?? [];
};

export const getBankConnections = async (): Promise<BankConnection[]> => {
  const { data } = await apiClient.get('/bank-connections/');
  return data;
};

export interface CreateBankConnectionPayload {
  provider: string;
  rut: string;
  password: string;
  display_name?: string;
}

export const createBankConnection = async (
  payload: CreateBankConnectionPayload
): Promise<BankConnection> => {
  const { data } = await apiClient.post('/bank-connections/', payload);
  return data;
};

export const deleteBankConnection = async (id: number): Promise<void> => {
  await apiClient.delete(`/bank-connections/${id}`);
};

export const updateBankCredentials = async (
  connectionId: number,
  payload: { rut?: string; password?: string }
): Promise<BankConnection> => {
  const { data } = await apiClient.patch(`/bank-connections/${connectionId}/credentials`, payload);
  return data;
};

export const getConnectionAccounts = async (
  connectionId: number
): Promise<ScrapedProviderAccount[]> => {
  const { data } = await apiClient.get(`/bank-connections/${connectionId}/accounts`);
  return data.accounts ?? [];
};

export const linkConnectionAccount = async (
  connectionId: number,
  providerAccountId: string,
  localAccountId?: number,
  enabled = true
): Promise<{
  connection_id: number;
  provider_account_id: string;
  local_account_id?: number;
  local_account_name?: string;
  sync_enabled: boolean;
}> => {
  const { data } = await apiClient.post(`/bank-connections/${connectionId}/link-account`, {
    provider_account_id: providerAccountId,
    local_account_id: localAccountId,
    enabled,
  });
  return data;
};

export const syncBankConnection = async (
  connectionId: number,
  providerAccountId?: string,
  providerAccountIds?: string[]
): Promise<BankSyncResponse> => {
  const { data } = await apiClient.post(`/bank-connections/${connectionId}/sync`, {
    provider_account_id: providerAccountId,
    provider_account_ids: providerAccountIds,
  });
  return data;
};
