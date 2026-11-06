import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationCategory,
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
  NotificationPreferences,
} from './notificationCategories.ts';

export interface NotificationItem {
  id: string;
  type: 'reaction' | 'comment' | 'reply' | 'tag' | 'message' | 'metric_help' | 'badge' | 'system' | 'goal_completed' | 'goal_reminder';
  message: string;
  timestamp: string;
  createdAt?: string;
  read: boolean;
  link?: string;
  referenceId?: string;
  actorId?: string;
  actorName?: string;
}

interface NotificationPanelProps {
  notifications: NotificationItem[];
  preferences: NotificationPreferences;
  onToggleCategory: (category: NotificationCategory) => void;
  onMarkAllRead: () => void;
  onNotificationClick: (notif: NotificationItem) => void;
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = memo(({
  notifications,
  preferences = DEFAULT_NOTIFICATION_PREFERENCES,
  onToggleCategory,
  onMarkAllRead,
  onNotificationClick,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<NotificationCategory>('community');
  const enabledUnreadCount = notifications.filter(n => n.type !== 'message' && !n.read && preferences[getNotificationCategory(n.type)]).length;
  const selectedCategory = NOTIFICATION_CATEGORIES.find(category => category.id === activeCategory) || NOTIFICATION_CATEGORIES[0];
  const selectedNotifications = useMemo(
    () => notifications.filter(item => item.type !== 'message' && getNotificationCategory(item.type) === selectedCategory.id).slice(0, 12),
    [notifications, selectedCategory.id],
  );
  const selectedUnreadCount = selectedNotifications.filter(item => !item.read).length;
  const handleToggleSelectedCategory = useCallback(() => onToggleCategory(selectedCategory.id), [onToggleCategory, selectedCategory.id]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return d.toLocaleDateString('vi-VN');
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'reaction': return '❤️';
      case 'comment': return '💬';
      case 'reply': return '↩️';
      case 'tag': return '@';
      case 'metric_help': return '📊';
      case 'badge': return '🏆';
      case 'goal_completed': return '🎉';
      case 'goal_reminder': return '⏰';
      default: return '🔔';
    }
  };

  return (
    <div className="fixed left-1/2 z-[100] mt-3 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-[26px] border border-slate-200 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:absolute sm:left-auto sm:right-0 sm:w-[390px] sm:translate-x-0">
      <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-emerald-50 px-4 py-3.5">
        <div>
          <p className="text-sm font-black text-slate-800">Thông báo</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
            {enabledUnreadCount > 0 ? `${enabledUnreadCount} chưa đọc` : 'Không có thông báo mới'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {enabledUnreadCount > 0 && (
            <button onClick={onMarkAllRead} className="text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700 hover:text-emerald-800">
              Đọc hết
            </button>
          )}
          <button onClick={onClose} aria-label="Đóng thông báo" className="text-lg text-slate-400 transition hover:text-slate-700">✕</button>
        </div>
      </div>

      <div role="tablist" aria-label="Phân loại thông báo" className="grid grid-cols-4 border-b border-slate-200 bg-white px-2 pt-2">
        {NOTIFICATION_CATEGORIES.map(category => {
          const isSelected = activeCategory === category.id;
          const unread = notifications.filter(item => getNotificationCategory(item.type) === category.id && !item.read).length;
          return (
            <button
              key={category.id}
              id={`notification-tab-${category.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="notification-tab-content"
              onClick={() => setActiveCategory(category.id)}
              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-t-xl px-1 py-2 text-center transition ${isSelected ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <span className="text-base leading-none">{category.icon}</span>
              <span className="max-w-full truncate text-[9px] font-black sm:text-[10px]">{category.title}</span>
              {unread > 0 && preferences[category.id] && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />}
              {isSelected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-emerald-600" />}
            </button>
          );
        })}
      </div>

      <section id="notification-tab-content" role="tabpanel" aria-labelledby={`notification-tab-${selectedCategory.id}`} className="max-h-[min(62vh,470px)] overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
          <span className="text-xl">{selectedCategory.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black text-slate-800">{selectedCategory.title}</h3>
              {selectedUnreadCount > 0 && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">{selectedUnreadCount} mới</span>}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">{preferences[selectedCategory.id] ? selectedCategory.description : 'Đã tắt nhận thông báo mới'}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences[selectedCategory.id]}
            aria-label={`Nhận thông báo: ${selectedCategory.title}`}
            title={`${preferences[selectedCategory.id] ? 'Tắt' : 'Bật'} thông báo ${selectedCategory.title.toLowerCase()}`}
            onClick={handleToggleSelectedCategory}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${preferences[selectedCategory.id] ? 'bg-emerald-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${preferences[selectedCategory.id] ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {selectedNotifications.length > 0 ? selectedNotifications.map(notification => (
          <button
            key={notification.id}
            onClick={() => onNotificationClick(notification)}
            className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${!notification.read ? 'bg-emerald-50/50' : ''}`}
          >
            <span className="mt-0.5 shrink-0 text-lg">{getIcon(notification.type)}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-xs leading-relaxed ${!notification.read ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>{notification.message}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">{formatTime(notification.timestamp || notification.createdAt || '')}</p>
            </div>
            {!notification.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
          </button>
        )) : (
          <div className="px-5 py-9 text-center">
            <p className="mb-2 text-2xl">{preferences[selectedCategory.id] ? selectedCategory.icon : '🔕'}</p>
            <p className="text-xs font-bold text-slate-500">{preferences[selectedCategory.id] ? 'Chưa có thông báo trong nhóm này.' : 'Thông báo của nhóm này đang tắt.'}</p>
          </div>
        )}
      </section>
    </div>
  );
});

NotificationPanel.displayName = 'NotificationPanel';
export default NotificationPanel;
