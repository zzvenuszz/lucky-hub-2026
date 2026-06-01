import { User, HealthMetric, AIKnowledge, AccountStatus, HealthGoal, ChatSession, AIRule, Post, Badge, AuditLog, GeminiKey } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sessionId = localStorage.getItem('lucky_hub_session');
  if (sessionId) {
    headers['Authorization'] = `Bearer ${sessionId}`;
  }
  return headers;
}

async function request<T>(url: string, method = 'GET', body?: any, timeout = 15000): Promise<T | null> {
  if (isOfflineMode) return null;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const startTime = Date.now();
  
  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    
    const duration = Date.now() - startTime;
    clearTimeout(id);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const msg = errorData.message || `Lỗi API ${res.status}`;
      
      // Xử lý session hết hạn
      if (res.status === 401 && errorData.reason === 'session_invalidated') {
        // Gửi sự kiện để App.tsx bắt và logout
        window.dispatchEvent(new CustomEvent('session:invalidated', { detail: errorData }));
      }
      
      if (window.debugLog) window.debugLog(`[DB] FAIL ${method} ${url}: ${msg}`, "error", duration);
      throw new Error(msg);
    }
    
    if (window.debugLog) window.debugLog(`[DB] OK ${method} ${url}`, "database", duration);
    return await res.json();
  } catch (e: any) {
    const duration = Date.now() - startTime;
    clearTimeout(id);
    if (e.name === 'AbortError') {
      throw new Error('Timeout: Server không phản hồi');
    }
    if (window.debugLog) window.debugLog(`[DB] ERROR ${url}: ${e.message}`, "error", duration);
    throw e;
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
  
  // Metrics
  getMetrics: async (userId?: string) => (userId ? await request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : await request<HealthMetric[]>(`${API_BASE}/all-metrics`)) ?? [],
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  updateMetric: (id: string, data: any) => request<HealthMetric>(`${API_BASE}/metrics/${id}`, 'PUT', data),
  deleteMetric: (id: string) => request(`${API_BASE}/metrics/${id}`, 'DELETE'),
  saveMetricsBulk: (data: any) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),
  deleteMetricsBulk: (ids: string[]) => request(`${API_BASE}/metrics/delete-bulk`, 'POST', { ids }),
  deleteAllUserMetrics: (userId: string) => request(`${API_BASE}/metrics/all/${userId}`, 'DELETE'),
  exportMetrics: (userId: string, format: 'csv' | 'json' = 'csv') => {
    const sessionId = localStorage.getItem('lucky_hub_session');
    const url = `${API_BASE}/metrics/export/${userId}?format=${format}`;
    // Open in new tab với auth header không thể dùng window.open
    // Dùng fetch và download
    return fetch(url, { headers: getAuthHeaders() })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `health_metrics.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
  },
  
  // Knowledge & Rules
  getKnowledge: async () => (await request<AIKnowledge[]>(`${API_BASE}/knowledge`)) ?? [],
  addKnowledge: (data: Omit<AIKnowledge, 'id'>) => request<AIKnowledge>(`${API_BASE}/knowledge`, 'POST', data),
  deleteKnowledge: (id: string) => request(`${API_BASE}/knowledge/${id}`, 'DELETE'),
  getRules: async () => (await request<AIRule[]>(`${API_BASE}/rules`)) ?? [],
  addRule: (data: Omit<AIRule, 'id'>) => request<AIRule>(`${API_BASE}/rules`, 'POST', data),
  deleteRule: (id: string) => request(`${API_BASE}/rules/${id}`, 'DELETE'),
  
  // Chats
  getChats: async () => (await request<ChatSession[]>(`${API_BASE}/chats`)) ?? [],
  saveChat: (chat: ChatSession) => request<ChatSession>(`${API_BASE}/chats`, 'POST', chat),
  clearChat: (chatId: string) => request<{ success: boolean }>(`${API_BASE}/chats/${chatId}/clear`, 'PUT'),
  
  // Posts
  getPosts: async () => (await request<Post[]>(`${API_BASE}/posts`)) ?? [],
  getPostsPaginated: async (page = 1, limit = 10, search = '', hashtag = '') => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (search) params.set('search', search);
    if (hashtag) params.set('hashtag', hashtag);
    return (await request<{ posts: Post[], pagination: { page: number, limit: number, total: number, totalPages: number, hasMore: boolean } }>(`${API_BASE}/posts?${params.toString()}`)) ?? { posts: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasMore: false } };
  },
  createPost: (post: Omit<Post, 'id'>) => request<Post>(`${API_BASE}/posts`, 'POST', post),
  updatePost: (id: string, data: { content: string, existingImages: string[], newImages: string[], hashtags?: string[] }) => 
    request<Post>(`${API_BASE}/posts/${id}`, 'PUT', data),
  deletePost: (id: string) => request(`${API_BASE}/posts/${id}`, 'DELETE'),
  reactToPost: (postId: string, userId: string, type: string, userName?: string, userAvatar?: string) => 
    request<Post>(`${API_BASE}/posts/${postId}/react`, 'PUT', { userId, type, userName, userAvatar }),
  removeReaction: (postId: string, userId: string, type: string) => 
    request<Post>(`${API_BASE}/posts/${postId}/react`, 'DELETE', { userId, type }),
  getPopularHashtags: async () => (await request<{ tag: string, count: number }[]>(`${API_BASE}/hashtags`)) ?? [],
  
  // Audit Logs
  getAuditLogs: async () => (await request<AuditLog[]>(`${API_BASE}/audit-logs`)) ?? [],
  
  // Gemini Keys Management
  getGeminiKeys: async () => (await request<GeminiKey[]>(`${API_BASE}/admin/gemini-keys`)) ?? [],
  getEnvKeys: async () => (await request<{ label: string, key: string, display: string }[]>(`${API_BASE}/admin/env-keys`)) ?? [],
  addGeminiKey: (data: { key: string, label: string, keyType?: 'gemini' | 'cline' }) => request<GeminiKey>(`${API_BASE}/admin/gemini-keys`, 'POST', data),
  deleteGeminiKey: (id: string) => request(`${API_BASE}/admin/gemini-keys/${id}`, 'DELETE'),
  toggleGeminiKey: (id: string, isActive: boolean) => request(`${API_BASE}/admin/gemini-keys/${id}/toggle`, 'PUT', { isActive }),
  checkKeyHealth: (key: string, keyType?: 'gemini' | 'cline') => request<{ status: string }>(`${API_BASE}/admin/gemini-keys/check`, 'POST', { key, keyType }),

  // Nutrition Groups (NDD)
  getNutritionGroups: async () => (await request<any[]>(`${API_BASE}/nutrition-groups`)) ?? [],
  getMyNutritionGroup: async () => (await request<{ group: any, pendingGroup: any }>(`${API_BASE}/nutrition-groups/mine`)) ?? { group: null, pendingGroup: null },
  getAllNutritionGroups: async () => (await request<any[]>(`${API_BASE}/nutrition-groups/all`)) ?? [],
  createNutritionGroup: (data: { name: string, ownerId?: string, ownerName?: string, address?: string }) => request<any>(`${API_BASE}/nutrition-groups`, 'POST', data),
  updateNutritionGroup: (id: string, data: any) => request<any>(`${API_BASE}/nutrition-groups/${id}`, 'PUT', data),
  deleteNutritionGroup: (id: string) => request(`${API_BASE}/nutrition-groups/${id}`, 'DELETE'),
  joinNutritionGroup: (id: string) => request<any>(`${API_BASE}/nutrition-groups/${id}/join-request`, 'POST'),
  cancelNutritionGroupRequest: (id: string) => request<any>(`${API_BASE}/nutrition-groups/${id}/cancel-request`, 'POST'),
  approveNutritionGroupMember: (groupId: string, userId: string) => request<any>(`${API_BASE}/nutrition-groups/${groupId}/approve/${userId}`, 'POST'),
  rejectNutritionGroupMember: (groupId: string, userId: string) => request<any>(`${API_BASE}/nutrition-groups/${groupId}/reject/${userId}`, 'POST'),
  removeNutritionGroupMember: (groupId: string, userId: string) => request<any>(`${API_BASE}/nutrition-groups/${groupId}/remove-member/${userId}`, 'POST'),

  // Chat Groups
  getChatGroups: async () => (await request<any[]>(`${API_BASE}/chat-groups`)) ?? [],
  getAllChatGroups: async () => (await request<any[]>(`${API_BASE}/chat-groups/all`)) ?? [],
  createChatGroup: (data: { name: string, nutritionGroupIds?: string[], memberIds?: string[] }) => request<any>(`${API_BASE}/chat-groups`, 'POST', data),
  updateChatGroup: (id: string, data: any) => request<any>(`${API_BASE}/chat-groups/${id}`, 'PUT', data),
  deleteChatGroup: (id: string) => request(`${API_BASE}/chat-groups/${id}`, 'DELETE'),
  getChatGroupMessages: (id: string) => request<{ groupName: string, messages: any[] }>(`${API_BASE}/chat-groups/${id}/messages`),
  sendChatGroupMessage: (id: string, content: string) => request<any>(`${API_BASE}/chat-groups/${id}/message`, 'POST', { content }),

  // Comments
  addComment: (postId: string, data: { content: string, parentId?: string | null, taggedUsers?: { userId: string, userName: string }[] }) => request<any>(`${API_BASE}/posts/${postId}/comments`, 'POST', data),
  editComment: (postId: string, commentId: string, content: string) => request<any>(`${API_BASE}/posts/${postId}/comments/${commentId}`, 'PUT', { content }),
  deleteComment: (postId: string, commentId: string) => request(`${API_BASE}/posts/${postId}/comments/${commentId}`, 'DELETE'),
  reactToComment: (postId: string, commentId: string, type: string) => request<{ reactions: any[] }>(`${API_BASE}/posts/${postId}/comments/${commentId}/react`, 'POST', { type }),

  // Goal Reminders
  checkGoalReminders: (userId: string) => request<{ reminders: any[] }>(`${API_BASE}/goals/check-reminders/${userId}`, 'POST'),
  notifyGoalCompleted: (goalId: string) => request<any>(`${API_BASE}/goals/${goalId}/notify-completed`, 'POST'),

  // Groups Management
  getGroups: async () => (await request<any[]>(`${API_BASE}/admin/groups`)) ?? [],
  createGroup: (data: { name: string, description?: string, permissions?: string[] }) => 
    request<any>(`${API_BASE}/admin/groups`, 'POST', data),
  updateGroup: (id: string, data: any) => request<any>(`${API_BASE}/admin/groups/${id}`, 'PUT', data),
  deleteGroup: (id: string) => request(`${API_BASE}/admin/groups/${id}`, 'DELETE'),
  updateGroupMembers: (id: string, memberIds: string[]) => 
    request<any>(`${API_BASE}/admin/groups/${id}/members`, 'POST', { memberIds }),
  getGroupPermissionsList: async () => (await request<{ key: string, description: string }[]>(`${API_BASE}/admin/groups/permissions-list`)) ?? [],
  getUserGroups: async (userId: string) => (await request<any[]>(`${API_BASE}/admin/groups/user/${userId}`)) ?? [],

  // Nutrition Branches
  getAllNutritionBranches: async () => (await request<any[]>(`${API_BASE}/nutrition-branches`)) ?? [],
  getMyNutritionBranches: async () => (await request<any[]>(`${API_BASE}/nutrition-branches/my-branches`)) ?? [],
  createNutritionBranch: (data: { name: string; nutritionGroupIds: string[] }) =>
    request<any>(`${API_BASE}/nutrition-branches`, 'POST', data),
  updateNutritionBranch: (id: string, data: any) => request<any>(`${API_BASE}/nutrition-branches/${id}`, 'PUT', data),
  deleteNutritionBranch: (id: string) => request(`${API_BASE}/nutrition-branches/${id}`, 'DELETE'),
  sendNutritionBranchMessage: (branchId: string, content: string) =>
    request<any>(`${API_BASE}/nutrition-branches/${branchId}/message`, 'POST', { content }),
  getNutritionBranchMessages: async (branchId: string) =>
    (await request<any[]>(`${API_BASE}/nutrition-branches/${branchId}/messages`)) ?? [],
  getNutritionBranchMembersMetrics: async (branchId: string) =>
    (await request<any[]>(`${API_BASE}/nutrition-branches/${branchId}/members-metrics`)) ?? [],

  // AI Config
  getAIConfig: async () => (await request<{ activeProvider: string; clineKeys: any[]; visionModels: any[] }>(`${API_BASE}/admin/ai-config`)) ?? { activeProvider: 'gemini', clineKeys: [], visionModels: [] },
  setAIConfig: (activeProvider: string) => request<{ success: boolean }>(`${API_BASE}/admin/ai-config`, 'PUT', { activeProvider }),
  testClineVision: (data: { apiKey: string; model: string; imageBase64: string; prompt: string }) =>
    request<{ success: boolean; text?: string; error?: string; cost?: string; resolvedModel?: string }>(`${API_BASE}/admin/ai/test-vision`, 'POST', data),
};
