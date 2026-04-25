import apiClient from './client';
import type { Category } from '../types';

export interface CategoryDefaultsResult {
  created_categories: number;
  created_subcategories: number;
  skipped_categories: number;
  skipped_subcategories: number;
}

export const getCategories = async (): Promise<Category[]> => {
  const { data } = await apiClient.get('/categories/');
  return data;
};

export const getCategoriesTree = async (): Promise<Category[]> => {
  const { data } = await apiClient.get('/categories/tree');
  return data;
};

export const createCategory = async (payload: Partial<Category>): Promise<Category> => {
  const { data } = await apiClient.post('/categories/', payload);
  return data;
};

export const updateCategory = async (id: number, payload: Partial<Category>): Promise<Category> => {
  const { data } = await apiClient.patch(`/categories/${id}`, payload);
  return data;
};

export const deleteCategory = async (id: number): Promise<void> => {
  await apiClient.delete(`/categories/${id}`);
};

export const createDefaultCategories = async (): Promise<CategoryDefaultsResult> => {
  const { data } = await apiClient.post('/categories/defaults');
  return data;
};
