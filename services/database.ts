
import { User, HealthMetric, AIKnowledge, UserRole, AccountStatus, HealthGoal, ChatSession, AIRule } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;

const logSystem = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
  if (window.debugLog) window.debugLog(`[Hệ thống] ${msg}`, type);
};

async function request<T>(url: string, method = 'GET', body?: any): Promise<T | null> {
  if (isOfflineMode) return mockRequest<T>(url, method, body);
  
  const endpoint = url.replace(API_BASE, '');
  logSystem(`Yêu cầu ${method}: ${endpoint}...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Tăng timeout lên 10s
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      logSystem(`LỖI ${res.status} tại ${endpoint}`, 'error');
      return null;
    }

    const data = await res.json();
    logSystem(`Thành công: ${method} ${endpoint}`, 'success');
    return data;
  } catch (e) {
    logSystem(`Lỗi kết nối nghiêm trọng: ${endpoint}`, 'error');
    isOfflineMode = true;
    return mockRequest<T>(url, method, body);
  }
}

function mockRequest<T>(url: string, method: string, body?: any): any {
  const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
  if (url.includes('/chats')) return getStorage('mock_chats');
  return null;
}

export const Database = {
  initialize: async () => {},
  getUsers: () => request<User[]>(`${API_BASE}/users`),
  updateUser: (id: string, data: Partial<User>) => request<User>(`${API_BASE}/users/${id}`, 'PUT', data),
  deleteUser: (id: string) => request(`${API_BASE}/users/${id}`, 'DELETE'),
  resetPassword: (id: string) => request<{newPassword: string}>(`${API_BASE}/users/${id}/reset-password`, 'POST'),
  
  getMetrics: (userId?: string) => userId ? request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : request<HealthMetric[]>(`${API_BASE}/all-metrics`),
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  updateMetric: (id: string, data: any) => request<HealthMetric>(`${API_BASE}/metrics/${id}`, 'PUT', data),
  deleteMetric: (id: string) => request(`${API_BASE}/metrics/${id}`, 'DELETE'),
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
