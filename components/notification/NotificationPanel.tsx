import React, { memo } from 'react';
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
  const enabledUnreadCount = notifications.filter(n => n.type !== 'message' && !n.read && preferences[getNotificationCategory(n.type)]).length;

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

      <div className="max-h-[min(72vh,560px)] overflow-y-auto divide-y divide-slate-100">
        {NOTIFICATION_CATEGORIES.map(category => {
          const items = notifications.filter(n => n.type !== 'message' && getNotificationCategory(n.type) === category.id);
          const unread = items.filter(n => !n.read && preferences[category.id]).length;
          return (
            <section key={category.id}>
              <div className="flex items-center gap-3 bg-slate-50/80 px-4 py-3">
                <span className="text-lg">{category.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-slate-800">{category.title}</h3>
                    {unread > 0 && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">{unread}</span>}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">{preferences[category.id] ? category.description : 'Đã tắt nhận thông báo mới'}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences[category.id]}
                  aria-label={`Nhận thông báo: ${category.title}`}
                  title={`${preferences[category.id] ? 'Tắt' : 'Bật'} thông báo ${category.title.toLowerCase()}`}
                  onClick={() => onToggleCategory(category.id as NotificationCategory)}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${preferences[category.id] ? 'bg-emerald-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${preferences[category.id] ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
              {items.length > 0 ? items.slice(0, 12).map(notif => (
                <button
                  key={notif.id}
                  onClick={() => onNotificationClick(notif)}
                  className={`flex w-full items-start gap-3 border-t border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${!notif.read && preferences[category.id] ? 'bg-emerald-50/50' : ''}`}
                >
                  <span className="mt-0.5 shrink-0 text-lg">{getIcon(notif.type)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-relaxed ${!notif.read ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>{notif.message}</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">{formatTime(notif.timestamp || notif.createdAt || '')}</p>
                  </div>
                  {!notif.read && preferences[category.id] && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
                </button>
              )) : (
                <p className="px-4 py-3 text-[11px] text-slate-400">Chưa có thông báo trong nhóm này.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
});

NotificationPanel.displayName = 'NotificationPanel';
export default NotificationPanel;
