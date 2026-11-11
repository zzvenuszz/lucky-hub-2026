import { User, HealthMetric, AIKnowledge, AccountStatus, HealthGoal, ChatSession, AIRule, Post, Badge, AuditLog } from '../types.ts';

const API_BASE = '/api';
let isOfflineMode = false;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return headers;
}

function getRequestScope(): string {
  try {
    const user = JSON.parse(localStorage.getItem('lucky_hub_user') || 'null');
    return String(user?.id || user?._id || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

async function request<T>(url: string, method = 'GET', body?: any, timeout = 15000): Promise<T | null> {
  if (isOfflineMode) return null;
  const normalizedMethod = method.toUpperCase();
  const inFlightKey = `${getRequestScope()}:${url}`;
  if (normalizedMethod === 'GET') {
    const pendingRequest = inFlightGetRequests.get(inFlightKey);
    if (pendingRequest) return pendingRequest as Promise<T | null>;
  }

  const requestPromise = (async (): Promise<T | null> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const startTime = Date.now();
  
  try {
    const res = await fetch(url, {
      method: normalizedMethod,
      headers: getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const duration = Date.now() - startTime;
      const msg = errorData.message || `Lỗi API ${res.status}`;
      
      // Xử lý session hết hạn
      if (res.status === 401 && ['session_invalidated', 'session_expired', 'no_token', 'invalid_token', 'user_not_found'].includes(errorData.reason)) {
        // Gửi sự kiện để App.tsx bắt và logout
        window.dispatchEvent(new CustomEvent('session:invalidated', { detail: errorData }));
      }
      
      if (window.debugLog) window.debugLog(`[DB] FAIL ${normalizedMethod} ${url}: ${msg}`, "error", duration);
      throw new Error(msg);
    }
    const data = await res.json();
    const duration = Date.now() - startTime;
    if (window.debugLog) window.debugLog(`[DB] OK ${normalizedMethod} ${url}`, "database", duration);
    return data;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    if (e.name === 'AbortError') {
      throw new Error('Timeout: Server không phản hồi');
    }
    if (window.debugLog) window.debugLog(`[DB] ERROR ${url}: ${e.message}`, "error", duration);
    throw e;
  } finally {
    clearTimeout(id);
  }
  })();

  if (normalizedMethod !== 'GET') return requestPromise;
  inFlightGetRequests.set(inFlightKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (inFlightGetRequests.get(inFlightKey) === requestPromise) inFlightGetRequests.delete(inFlightKey);
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
  getSponsorUpline: (userId: string) => request<{ nodes: Array<{ id: string; fullName: string; memberNumber: string; memberLevel: string }>; pendingSponsorNumber: string }>(`${API_BASE}/users/sponsor-tree/${encodeURIComponent(userId)}`),
  inventory: {
    getCategories: () => request<any[]>(`${API_BASE}/inventory/categories`),
    createCategory: (name: string) => request<any>(`${API_BASE}/inventory/categories`, 'POST', { name }),
    getItems: () => request<any[]>(`${API_BASE}/inventory/items`),
    createItem: (data: any) => request<any>(`${API_BASE}/inventory/items`, 'POST', data),
    updateItem: (id: string, data: any) => request<any>(`${API_BASE}/inventory/items/${id}`, 'PUT', data),
    updateItemsPvBatch: (items: Array<{ itemId: string; pv: number }>) => request<any>(`${API_BASE}/inventory/items/bulk-pv`, 'PUT', { items }),
    updateThreshold: (id: string, lowStockThreshold: number) => request<any>(`${API_BASE}/inventory/items/${id}/threshold`, 'PUT', { lowStockThreshold }),
    deleteItem: (id: string) => request<any>(`${API_BASE}/inventory/items/${id}`, 'DELETE'),
    receiveStock: (id: string, data: any) => request<any>(`${API_BASE}/inventory/items/${id}/receive`, 'POST', data),
    receiveBatch: (data: { receivedAt?: string; reason?: string; lines: Array<{ itemId?: string; sku: string; quantity: number; unitCost?: number }> }) => request<any>(`${API_BASE}/inventory/receive-batch`, 'POST', data),
    adjustStock: (id: string, data: any) => request<any>(`${API_BASE}/inventory/items/${id}/adjust`, 'POST', data),
    movements: () => request<any[]>(`${API_BASE}/inventory/movements`),
    overview: () => request<any>(`${API_BASE}/inventory/overview`),
    priceList: (at?: string) => request<any>(`${API_BASE}/inventory/price-list${at ? `?at=${encodeURIComponent(at)}` : ''}`),
    priceListProducts: () => request<any[]>(`${API_BASE}/inventory/price-list/products`),
    savePriceList: (data: any) => request<any>(`${API_BASE}/inventory/price-list`, 'POST', data),
    updatePriceList: (id: string, data: any) => request<any>(`${API_BASE}/inventory/price-list/${id}`, 'PUT', data),
    deletePriceList: (id: string) => request<any>(`${API_BASE}/inventory/price-list/${id}`, 'DELETE'),
    findMembers: (q: string) => request<any[]>(`${API_BASE}/inventory/members?q=${encodeURIComponent(q)}`),
    saveSale: (data: any) => request<any>(`${API_BASE}/inventory/sales`, 'POST', data),
    getSales: (query = '') => request<any>(`${API_BASE}/inventory/sales${query ? `?${query}` : ''}`),
    getSale: (id: string) => request<any>(`${API_BASE}/inventory/sales/${id}`),
    changeBuyer: (id: string, data: any) => request<any>(`${API_BASE}/inventory/sales/${id}/buyer`, 'PUT', data),
    returnSale: (id: string, data: any) => request<any>(`${API_BASE}/inventory/sales/${id}/return`, 'POST', data),
    cancelSale: (id: string, reason: string) => request<any>(`${API_BASE}/inventory/sales/${id}/cancel`, 'POST', { reason }),
    deleteSale: (id: string) => request<any>(`${API_BASE}/inventory/sales/${id}`, 'DELETE'),
    deleteCancelledSales: () => request<any>(`${API_BASE}/inventory/sales/cancelled`, 'DELETE'),
    memberReport: (query: string) => request<any[]>(`${API_BASE}/inventory/reports/member-purchases?${query}`),
    analyticsReport: (query = '') => request<any>(`${API_BASE}/inventory/reports/analytics${query ? `?${query}` : ''}`),
    printPreference: () => request<any>(`${API_BASE}/inventory/print-preference`),
    savePrintPreference: (data: any) => request<any>(`${API_BASE}/inventory/print-preference`, 'PUT', data),
    setMemberLevel: (id: string, data: any) => request<any>(`${API_BASE}/inventory/members/${id}/level`, 'PUT', data),
    downline: () => request<any[]>(`${API_BASE}/inventory/members/downline`),
    memberPurchases: (id: string) => request<any>(`${API_BASE}/inventory/members/${id}/purchases`),
  },
  deleteUser: (id: string) => request(`${API_BASE}/users/${id}`, 'DELETE'),
  resetUserInventoryData: (id: string, confirmationText: string) => request<any>(`${API_BASE}/users/${id}/inventory-data`, 'DELETE', { confirmationText }),
  
  // Metrics
  getMetrics: async (userId?: string) => (userId ? await request<HealthMetric[]>(`${API_BASE}/metrics/${userId}`) : await request<HealthMetric[]>(`${API_BASE}/all-metrics`)) ?? [],
  saveMetric: (data: any) => request<HealthMetric>(`${API_BASE}/metrics`, 'POST', data),
  updateMetric: (id: string, data: any) => request<HealthMetric>(`${API_BASE}/metrics/${id}`, 'PUT', data),
  deleteMetric: (id: string) => request(`${API_BASE}/metrics/${id}`, 'DELETE'),
  saveMetricsBulk: (data: any) => request<HealthMetric[]>(`${API_BASE}/metrics/bulk`, 'POST', data),
  deleteMetricsBulk: (ids: string[]) => request(`${API_BASE}/metrics/delete-bulk`, 'POST', { ids }),
  deleteAllUserMetrics: (userId: string) => request(`${API_BASE}/metrics/all/${userId}`, 'DELETE'),
  exportMetrics: async (userId: string, format: 'csv' | 'json' = 'csv') => {
    try {
      const url = `${API_BASE}/metrics/export/${userId}?format=${format}`;
      const response = await fetch(url, { headers: getAuthHeaders() });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Export failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `health_metrics.${format}`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      console.log(`[DB] Metrics exported successfully (${format})`);
    } catch (err: any) {
      console.error(`[DB] Export metrics failed:`, err.message);
      if (window.debugLog) window.debugLog(`[DB] Export metrics FAILED: ${err.message}`, "error");
      throw err;
    }
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
  
  // NOTE: legacy Gemini/Cline key management methods were removed together with
  // their endpoints (/admin/gemini-keys*, /admin/env-keys) in the AI system rewrite.

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
  upgradeNutritionGroupMember: (nddGroupId: string, userId: string, targetGroupId: string) =>
    request<any>(`${API_BASE}/nutrition-groups/${nddGroupId}/upgrade-member/${userId}`, 'POST', { targetGroupId }),

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
  reactToComment: (postId: string, commentId: string, type: string, userName?: string, userAvatar?: string) => {
    const body: any = { type };
    if (userName) body.userName = userName;
    if (userAvatar) body.userAvatar = userAvatar;
    return request<{ reactions: any[] }>(`${API_BASE}/posts/${postId}/comments/${commentId}/react`, 'POST', body);
  },

  // Goal Reminders
  checkGoalReminders: (userId: string) => request<{ reminders: any[] }>(`${API_BASE}/goals/check-reminders/${userId}`, 'POST'),
  notifyGoalCompleted: (goalId: string) => request<any>(`${API_BASE}/goals/${goalId}/notify-completed`, 'POST'),

  // Groups Management
  getGroups: async () => (await request<any[]>(`${API_BASE}/admin/groups`)) ?? [],
  createGroup: (data: { name: string, description?: string, permissions?: string[], isDefault?: boolean, allowMemberUpgrade?: boolean, priority?: number }) => 
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

  // NOTE: legacy AI config methods (getAIConfig/setAIConfig/testClineVision) were removed
  // together with their endpoints (/admin/ai-config, /admin/ai/test-vision).

  // AI Providers (New System)
  getAIProviders: async () => {
    const result = await request<{ providers: any[] }>(`${API_BASE}/admin/ai/providers`);
    return result?.providers ?? [];
  },
  getProviderDefinitions: async () => {
    const result = await request<{ definitions: any[] }>(`${API_BASE}/admin/ai/definitions`);
    return result?.definitions ?? [];
  },
  createAIProvider: (data: any) => request<any>(`${API_BASE}/admin/ai/providers`, 'POST', data),
  updateAIProvider: (id: string, data: any) => request<any>(`${API_BASE}/admin/ai/providers/${id}`, 'PUT', data),
  deleteAIProvider: (id: string) => request(`${API_BASE}/admin/ai/providers/${id}`, 'DELETE'),
  discoverModels: (providerId: string) => request<any>(`${API_BASE}/admin/ai/providers/${providerId}/discover`, 'POST'),
  discoverModelsInline: (config: { providerId: string; baseUrl: string; apiKey?: string; apiKeys?: any[]; name?: string; customHeaders?: any[] }) => request<any>(`${API_BASE}/admin/ai/providers/discover-inline`, 'POST', config),
  discoverAllModels: async () => {
    const result = await request<{ results: any[] }>(`${API_BASE}/admin/ai/providers/discover-all`, 'POST');
    return result?.results ?? [];
  },
  testAIProvider: (providerId: string) => request<any>(`${API_BASE}/admin/ai/providers/${providerId}/test`, 'POST'),

  // AI Task Configs
  getAITaskConfigs: async () => (await request<{ taskConfigs: any[] }>(`${API_BASE}/admin/ai/task-configs`))?.taskConfigs ?? [],
  updateAITaskConfig: (taskType: string, data: any) => request<any>(`${API_BASE}/admin/ai/task-configs/${taskType}`, 'PUT', data),
  getAvailableModelsForTask: async (taskType: string) => (await request<{ availableModels: any[] }>(`${API_BASE}/admin/ai/task-configs/${taskType}`))?.availableModels ?? [],

  // AI Logs
  getAILogs: async (query: string) => (await request<{ logs: any[], total: number, page: number, limit: number }>(`${API_BASE}/admin/ai/logs?${query}`)) ?? { logs: [], total: 0, page: 1, limit: 50 },
  getAILogStats: async (hours: number) => (await request<any>(`${API_BASE}/admin/ai/logs/stats?hours=${hours}`)) ?? {},
  getAIDebugMode: async () => (await request<{ debugMode: boolean }>(`${API_BASE}/admin/ai/logs/debug-mode`)) ?? { debugMode: false },
  setAIDebugMode: (enabled: boolean) => request<{ success: boolean, debugMode: boolean }>(`${API_BASE}/admin/ai/logs/debug-mode`, 'PUT', { enabled }),
  cleanAILogs: async (olderThanDays: number) => (await request<{ deletedCount: number }>(`${API_BASE}/admin/ai/logs`, 'DELETE', { olderThanDays })) ?? { deletedCount: 0 },
};
