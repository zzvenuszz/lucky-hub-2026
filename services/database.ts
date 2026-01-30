
import { User, HealthMetric, AIKnowledge, UserRole, AccountStatus, HealthGoal, ChatSession, AIRule, Post, Badge } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;

const logSystem = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
  if (window.debugLog) window.debugLog(`[Hệ thống] ${msg}`, type);
};

async function request<T>(url: string, method = 'GET', body?: any, timeout = 15000): Promise<T | null> {
  if (isOfflineMode) return null;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch (e: any) {
    clearTimeout(id);
    return null;
  }
}

export const BADGES_DB: Badge[] = [
  { id: 'b_weight_loss_god', name: 'Chiến thần diệt mỡ', icon: '🔥', description: 'Giảm ít nhất 3kg cân nặng trong vòng 30 ngày.', color: 'bg-rose-500' },
  { id: 'b_7_golden_days', name: '7 ngày vàng', icon: '⭐', description: 'Giảm ít nhất 1kg ngay trong tuần đầu tiên tham gia.', color: 'bg-amber-500' },
  { id: 'b_fat_destroyer', name: 'Đánh tan mỡ thừa', icon: '💎', description: 'Giảm ít nhất 3% tỉ lệ mỡ cơ thể so với lúc bắt đầu.', color: 'bg-indigo-500' },
  { id: 'b_dedicated', name: 'Thành viên chuyên cần', icon: '🏆', description: 'Danh hiệu dành cho hội viên tích cực cập nhật chỉ số.', color: 'bg-emerald-500' }
];

export const Database = {
  checkHealth: async () => request(`${API_BASE}/health`),
  getUsers: async () => (await request<User[]>(`${API_BASE}/users`)) ?? [],
  updateUser: (id: string, data: Partial<User>) => request<User>(`${API_BASE}/users/${id}`, 'PUT', data),
  deleteUser: (id: string) => request(`${API_BASE}/users/${id}`, 'DELETE'),
  getMetrics: async (userId?: string) => (userId ? await request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : await request<HealthMetric[]>(`${API_BASE}/all-metrics`)) ?? [],
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  updateMetric: (id: string, data: any) => request<HealthMetric>(`${API_BASE}/metrics/${id}`, 'PUT', data),
  deleteMetric: (id: string) => request(`${API_BASE}/metrics/${id}`, 'DELETE'),
  saveMetricsBulk: (data: any[]) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),
  deleteMetricsBulk: (ids: string[]) => request(`${API_BASE}/metrics/delete-bulk`, 'POST', { ids }),
  deleteAllUserMetrics: (userId: string) => request(`${API_BASE}/metrics/all/${userId}`, 'DELETE'),
  getKnowledge: async () => (await request<AIKnowledge[]>(`${API_BASE}/knowledge`)) ?? [],
  addKnowledge: (data: Omit<AIKnowledge, 'id'>) => request<AIKnowledge>(`${API_BASE}/knowledge`, 'POST', data),
  deleteKnowledge: (id: string) => request(`${API_BASE}/knowledge/${id}`, 'DELETE'),
  getRules: async () => (await request<AIRule[]>(`${API_BASE}/rules`)) ?? [],
  addRule: (data: Omit<AIRule, 'id'>) => request<AIRule>(`${API_BASE}/rules`, 'POST', data),
  deleteRule: (id: string) => request(`${API_BASE}/rules/${id}`, 'DELETE'),
  getChats: async () => (await request<ChatSession[]>(`${API_BASE}/chats`)) ?? [],
  saveChat: (chat: ChatSession) => request<ChatSession>(`${API_BASE}/chats`, 'POST', chat),
  getPosts: async () => (await request<Post[]>(`${API_BASE}/posts`)) ?? [],
  createPost: (post: Omit<Post, 'id'>) => request<Post>(`${API_BASE}/posts`, 'POST', post),
  deletePost: (id: string) => request(`${API_BASE}/posts/${id}`, 'DELETE'),
  reactToPost: (postId: string, userId: string, type: string, userName?: string, userAvatar?: string) => 
    request<Post>(`${API_BASE}/posts/${postId}/react`, 'PUT', { userId, type, userName, userAvatar }),
};
