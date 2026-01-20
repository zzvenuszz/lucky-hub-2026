
import { User, HealthMetric, AIKnowledge } from '../types.ts';

const API_BASE = '/api';

async function request<T>(url: string, method = 'GET', body?: any): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(e);
    return null;
  }
}

export const Database = {
  initialize: async () => {},

  getUsers: () => request<User[]>(`${API_BASE}/users`),
  updateUser: (id: string, data: Partial<User>) => request<User>(`${API_BASE}/users/${id}`, 'PUT', data),
  resetPassword: (id: string) => request<{newPassword: string}>(`${API_BASE}/users/${id}/reset-password`, 'POST'),
  
  getMetrics: (userId?: string) => userId 
    ? request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) 
    : request<HealthMetric[]>(`${API_BASE}/all-metrics`),
  
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  saveMetricsBulk: (data: any[]) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),

  getKnowledge: () => request<AIKnowledge[]>(`${API_BASE}/knowledge`),
  addKnowledge: (data: Omit<AIKnowledge, 'id'>) => request<AIKnowledge>(`${API_BASE}/knowledge`, 'POST', data),
  deleteKnowledge: (id: string) => request(`${API_BASE}/knowledge/${id}`, 'DELETE'),

  getChats: () => JSON.parse(localStorage.getItem('lucky_hub_chats') || '[]'),
  saveChats: (chats: any) => localStorage.setItem('lucky_hub_chats', JSON.stringify(chats))
};
