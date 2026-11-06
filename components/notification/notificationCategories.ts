export type NotificationCategory = 'community' | 'goals' | 'metrics' | 'system';
export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const NOTIFICATION_CATEGORIES: Array<{
  id: NotificationCategory;
  title: string;
  description: string;
  icon: string;
}> = [
  { id: 'community', title: 'Cộng đồng', description: 'Cảm xúc, bình luận, trả lời và nhắc tên', icon: '💬' },
  { id: 'goals', title: 'Mục tiêu', description: 'Nhắc hạn và thông báo hoàn thành', icon: '🎯' },
  { id: 'metrics', title: 'Sức khỏe', description: 'Cập nhật chỉ số và huy hiệu', icon: '📊' },
  { id: 'system', title: 'Hệ thống', description: 'Tài khoản và các thông báo khác', icon: '🔔' },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  community: true,
  goals: true,
  metrics: true,
  system: true,
};

export function getNotificationCategory(type: string): NotificationCategory {
  if (['reaction', 'comment', 'reply', 'tag'].includes(type)) return 'community';
  if (['goal_completed', 'goal_reminder'].includes(type)) return 'goals';
  if (['metric_help', 'badge'].includes(type)) return 'metrics';
  return 'system';
}
