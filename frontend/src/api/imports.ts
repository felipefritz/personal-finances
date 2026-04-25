import apiClient from './client';
import type { ImportFile, ImportPreviewResponse } from '../types';

export const uploadExcel = async (
  file: File,
  accountId?: number
): Promise<ImportPreviewResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (accountId) formData.append('account_id', String(accountId));
  const { data } = await apiClient.post('/imports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const uploadPdf = async (
  file: File,
  accountId?: number,
  pdfPassword?: string,
  savePdfPassword?: boolean
): Promise<ImportPreviewResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  if (accountId) formData.append('account_id', String(accountId));
  if (pdfPassword) formData.append('pdf_password', pdfPassword);
  if (savePdfPassword) formData.append('save_pdf_password', 'true');
  const { data } = await apiClient.post('/imports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const confirmImport = async (
  importFileId: number,
  accountId: number,
  pdfPassword?: string,
  columnMapping?: Record<string, string>
): Promise<{ saved: number; skipped: number; import_file_id: number }> => {
  const { data } = await apiClient.post(`/imports/${importFileId}/confirm`, {
    account_id: accountId,
    pdf_password: pdfPassword,
    column_mapping: columnMapping,
    skip_duplicates: true,
  });
  return data;
};

export const setAccountPdfPassword = async (
  accountId: number,
  password: string
): Promise<{ account_id: number; has_password: boolean }> => {
  const { data } = await apiClient.post('/imports/pdf-password', null, {
    params: {
      account_id: accountId,
      password,
    },
  });
  return data;
};

export const getAccountPdfPasswordStatus = async (
  accountId: number
): Promise<{ account_id: number; has_password: boolean }> => {
  const { data } = await apiClient.get(`/imports/pdf-password/${accountId}`);
  return data;
};

export const getImportFiles = async (): Promise<ImportFile[]> => {
  const { data } = await apiClient.get('/imports/');
  return data;
};

export const deleteImportFile = async (id: number): Promise<void> => {
  await apiClient.delete(`/imports/${id}`);
};
