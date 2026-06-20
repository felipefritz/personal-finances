import apiClient from './client';
import type {
  AnnualProjection,
  ActiveInstallment,
  BudgetRules,
  MonthBreakdown,
  InstallmentPrepayPayload,
  InstallmentPrepayResult,
  InstallmentPrepayRevertPayload,
  InstallmentPrepayRevertResult,
} from '../types';

export const getAnnualProjection = async (
  year?: number,
  accountId?: number,
  includeInternalTransfers = false,
): Promise<AnnualProjection> => {
  const params: Record<string, number | boolean> = {};
  if (year) params.year = year;
  if (accountId) params.account_id = accountId;
  params.include_internal_transfers = includeInternalTransfers;
  const { data } = await apiClient.get('/projections/annual', { params });
  return data;
};

export const getActiveInstallments = async (accountId?: number): Promise<ActiveInstallment[]> => {
  const params: Record<string, number> = {};
  if (accountId) params.account_id = accountId;
  const { data } = await apiClient.get('/projections/installments', { params });
  return data;
};

export const getBudgetRules = async (
  accountId?: number,
  year?: number,
  month?: number,
  includeInternalTransfers = false,
): Promise<BudgetRules> => {
  const params: Record<string, number | boolean> = {};
  if (accountId) params.account_id = accountId;
  if (year) params.year = year;
  if (month) params.month = month;
  params.include_internal_transfers = includeInternalTransfers;
  const { data } = await apiClient.get('/projections/budget-rules', { params });
  return data;
};

export const getMonthBreakdown = async (
  year: number,
  month: number,
  includeInternalTransfers = false,
): Promise<MonthBreakdown> => {
  const params: Record<string, number | boolean> = { year, month, include_internal_transfers: includeInternalTransfers };
  const { data } = await apiClient.get('/projections/month-breakdown', { params });
  return data;
};

export const prepayInstallmentDebt = async (
  transactionId: number,
  payload: InstallmentPrepayPayload,
): Promise<InstallmentPrepayResult> => {
  const { data } = await apiClient.post(`/projections/installments/${transactionId}/prepay`, payload);
  return data;
};

export const revertInstallmentPrepay = async (
  transactionId: number,
  payload: InstallmentPrepayRevertPayload,
): Promise<InstallmentPrepayRevertResult> => {
  const { data } = await apiClient.post(`/projections/installments/${transactionId}/prepay/revert`, payload);
  return data;
};
