import apiClient from './client';
import type { AgentAnalysis } from '../types';

export const getAgentAnalysis = async (month?: number, year?: number): Promise<AgentAnalysis> => {
  const params: Record<string, number> = {};
  if (month) params.month = month;
  if (year) params.year = year;
  const { data } = await apiClient.get('/agent/analyze', { params });
  return data;
};

export const chatWithAgent = async (
  message: string,
  month?: number,
  year?: number
): Promise<{ response: string; context?: Record<string, unknown> }> => {
  const { data } = await apiClient.post('/agent/chat', { message, month, year });
  return data;
};
