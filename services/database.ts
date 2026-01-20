
import { User, HealthMetric, AIKnowledge, UserRole, AccountStatus, HealthGoal } from '../types.ts';

const API_BASE = '/api';

// Helper để kiểm tra xem server có đang hoạt động không
let isOfflineMode = false;

async function request<T>(url: string, method = 'GET', body?: any): Promise<T | null> {
  // Nếu đã biết là offline, sử dụng mock luôn
  if (isOfflineMode) return mockRequest<T>(url, method, body);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 giây timeout

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
    console.warn("API Connection failed, switching to local storage mode.");
    isOfflineMode = true; // Chuyển sang chế độ offline cho các request sau
    return mockRequest<T>(url, method, body);
  }
}

// Giả lập backend bằng LocalStorage cho môi trường Preview
function mockRequest<T>(url: string, method: string, body?: any): any {
  const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
  const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

  if (url.includes('/login') && method === 'POST') {
    const users = getStorage('mock_users');
    const user = users.find((u: any) => u.username === body.username && u.password === body.password);
    if (!user && body.username === 'admin') { // Mặc định cho admin nếu chưa có
      return { id: 'admin', username: 'admin', fullName: 'Admin (Offline)', role: UserRole.ADMIN, status: AccountStatus.ACTIVE, gender: 'Nam', healthGoal: HealthGoal.STRENGTHEN_HEALTH };
    }
    return user || null;
  }

  if (url.includes('/register') && method === 'POST') {
    const users = getStorage('mock_users');
    const newUser = { ...body, id: 'u_' + Date.now(), role: UserRole.MEMBER, status: AccountStatus.ACTIVE };
    users.push(newUser);
    setStorage('mock_users', users);
    return { message: 'Đăng ký thành công (Local)' };
  }

  if (url.includes('/users') && method === 'GET') return getStorage('mock_users');
  
  if (url.includes('/metrics') && method === 'GET') {
    const userId = url.split('/').pop();
    const allMetrics = getStorage('mock_metrics');
    return allMetrics.filter((m: any) => m.userId === userId);
  }

  if (url.includes('/metrics') && method === 'POST') {
    const metrics = getStorage('mock_metrics');
    const newMetric = { ...body, id: 'm_' + Date.now() };
    metrics.push(newMetric);
    setStorage('mock_metrics', metrics);
    return newMetric;
  }

  if (url.includes('/knowledge')) return getStorage('mock_knowledge');

  return null;
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
