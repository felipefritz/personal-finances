import apiClient from './client';
import type { BankConnection, FintocConnectResponse, FintocProviderAccount, FintocSyncResponse } from '../types';

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
  accountId?: number,
  secretKey?: string
): Promise<FintocConnectResponse> => {
  const { data } = await apiClient.post('/bank-connections/fintoc/connect', {
    link_token: linkToken,
    account_id: accountId,
    secret_key: secretKey,
  });
  return data;
};

export const syncFintocConnection = async (
  connectionId: number,
  providerAccountId?: string,
  providerAccountIds?: string[]
): Promise<FintocSyncResponse> => {
  const { data } = await apiClient.post(`/bank-connections/fintoc/sync`, {
    connection_id: connectionId,
    provider_account_id: providerAccountId,
    provider_account_ids: providerAccountIds,
  });
  return data;
};

export const getFintocAccounts = async (connectionId: number): Promise<FintocProviderAccount[]> => {
  const { data } = await apiClient.get(`/bank-connections/fintoc/accounts/${connectionId}`);
  return data.accounts ?? [];
};

export const linkFintocAccount = async (
  connectionId: number,
  providerAccountId: string,
  localAccountId?: number,
  enabled = true
): Promise<{ connection_id: number; provider_account_id: string; local_account_id?: number; local_account_name?: string; sync_enabled: boolean }> => {
  const { data } = await apiClient.post('/bank-connections/fintoc/link-account', {
    connection_id: connectionId,
    provider_account_id: providerAccountId,
    local_account_id: localAccountId,
    enabled,
  });
  return data;
};

export const updateFintocCredentials = async (
  connectionId: number,
  linkToken?: string,
  secretKey?: string
): Promise<{ connection_id: number; status: string; has_access_token: boolean; has_fintoc_secret_key: boolean }> => {
  const { data } = await apiClient.patch('/bank-connections/fintoc/credentials', {
    connection_id: connectionId,
    link_token: linkToken,
    secret_key: secretKey,
  });
  return data;
};

export const getFintocCredentials = async (
  connectionId: number
): Promise<{ connection_id: number; has_access_token: boolean; access_token?: string; has_fintoc_secret_key: boolean; fintoc_secret_key?: string }> => {
  const { data } = await apiClient.get(`/bank-connections/fintoc/credentials/${connectionId}`);
  return data;
};
