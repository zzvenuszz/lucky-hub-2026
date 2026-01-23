
import { User, HealthMetric, AIKnowledge, UserRole, AccountStatus, HealthGoal, ChatSession, AIRule, Post, Badge } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;

const logSystem = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
  if (window.debugLog) window.debugLog(`[Hệ thống] ${msg}`, type);
};

async function request<T>(url: string, method = 'GET', body?: any): Promise<T | null> {
  if (isOfflineMode) return null;
  
  const endpoint = url.replace(API_BASE, '');
  logSystem(`Yêu cầu ${method}: ${endpoint}...`);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      logSystem(`LỖI ${res.status} tại ${endpoint}`, 'error');
      return null;
    }

    const data = await res.json();
    logSystem(`Thành công: ${method} ${endpoint}`, 'success');
    return data;
  } catch (e) {
    logSystem(`Lỗi kết nối nghiêm trọng: ${endpoint}`, 'error');
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
  getUsers: () => request<User[]>(`${API_BASE}/users`),
  updateUser: (id: string, data: Partial<User>) => request<User>(`${API_BASE}/users/${id}`, 'PUT', data),
  deleteUser: (id: string) => request(`${API_BASE}/users/${id}`, 'DELETE'),
  
  getMetrics: (userId?: string) => userId ? request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : request<HealthMetric[]>(`${API_BASE}/all-metrics`),
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  updateMetric: (id: string, data: any) => request<HealthMetric>(`${API_BASE}/metrics/${id}`, 'PUT', data),
  deleteMetric: (id: string) => request(`${API_BASE}/metrics/${id}`, 'DELETE'),
  saveMetricsBulk: (data: any[]) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),
  
  getKnowledge: () => request<AIKnowledge[]>(`${API_BASE}/knowledge`),
  addKnowledge: (data: Omit<AIKnowledge, 'id'>) => request<AIKnowledge>(`${API_BASE}/knowledge`, 'POST', data),
  deleteKnowledge: (id: string) => request(`${API_BASE}/knowledge/${id}`, 'DELETE'),

  getRules: () => request<AIRule[]>(`${API_BASE}/rules`),
  addRule: (data: Omit<AIRule, 'id'>) => request<AIRule>(`${API_BASE}/rules`, 'POST', data),
  deleteRule: (id: string) => request(`${API_BASE}/rules/${id}`, 'DELETE'),
  
  getChats: () => request<ChatSession[]>(`${API_BASE}/chats`),
  saveChat: (chat: ChatSession) => request<ChatSession>(`${API_BASE}/chats`, 'POST', chat),

  // News Feed API
  getPosts: () => request<Post[]>(`${API_BASE}/posts`),
  createPost: (post: Omit<Post, 'id'>) => request<Post>(`${API_BASE}/posts`, 'POST', post),
  deletePost: (id: string) => request(`${API_BASE}/posts/${id}`, 'DELETE'),
};
