
import { User, HealthMetric, AIKnowledge, UserRole, AccountStatus, HealthGoal, ChatSession, AIRule } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;

async function request<T>(url: string, method = 'GET', body?: any): Promise<T | null> {
  if (isOfflineMode) return mockRequest<T>(url, method, body);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("Switching to offline mode.");
    isOfflineMode = true;
    return mockRequest<T>(url, method, body);
  }
}

function mockRequest<T>(url: string, method: string, body?: any): any {
  const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
  const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));
  if (url.includes('/chats')) return getStorage('mock_chats');
  return null;
}

export const Database = {
  initialize: async () => {},
  getUsers: () => request<User[]>(`${API_BASE}/users`),
  updateUser: (id: string, data: Partial<User>) => request<User>(`${API_BASE}/users/${id}`, 'PUT', data),
  resetPassword: (id: string) => request<{newPassword: string}>(`${API_BASE}/users/${id}/reset-password`, 'POST'),
  getMetrics: (userId?: string) => userId ? request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : request<HealthMetric[]>(`${API_BASE}/all-metrics`),
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  saveMetricsBulk: (data: any[]) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),
  deleteMetricsByDates: (userId: string, dates: string[]) => request(`${API_BASE}/metrics/delete-dates`, 'POST', { userId, dates }),
  
  getKnowledge: () => request<AIKnowledge[]>(`${API_BASE}/knowledge`),
  addKnowledge: (data: Omit<AIKnowledge, 'id'>) => request<AIKnowledge>(`${API_BASE}/knowledge`, 'POST', data),
  deleteKnowledge: (id: string) => request(`${API_BASE}/knowledge/${id}`, 'DELETE'),

  getRules: () => request<AIRule[]>(`${API_BASE}/rules`),
  addRule: (data: Omit<AIRule, 'id'>) => request<AIRule>(`${API_BASE}/rules`, 'POST', data),
  deleteRule: (id: string) => request(`${API_BASE}/rules/${id}`, 'DELETE'),
  
  getChats: () => request<ChatSession[]>(`${API_BASE}/chats`),
  saveChat: (chat: ChatSession) => request<ChatSession>(`${API_BASE}/chats`, 'POST', chat)
};
