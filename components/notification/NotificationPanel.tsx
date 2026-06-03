import React, { memo } from 'react';

export interface NotificationItem {
  id: string;
  type: 'reaction' | 'comment' | 'reply' | 'tag' | 'message' | 'metric_help' | 'badge' | 'system' | 'goal_completed' | 'goal_reminder';
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  referenceId?: string;
  actorId?: string;
  actorName?: string;
}

interface NotificationPanelProps {
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onNotificationClick: (notif: NotificationItem) => void;
  onClose: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = memo(({ 
  notifications, onMarkAllRead, onNotificationClick, onClose, isMuted, onToggleMute 
}) => {
  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    const now = Date.now();
    const diff = now - d.getTime();
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
      case 'message': return '📩';
      case 'metric_help': return '📊';
      case 'badge': return '🏆';
      case 'system': return '🔔';
      case 'goal_completed': return '🎉';
      case 'goal_reminder': return '⏰';
      default: return '📌';
    }
  };

  return (
    <div className="fixed sm:absolute left-1/2 sm:left-auto -translate-x-1/2 sm:translate-x-0 right-auto sm:right-0 mt-3 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 z-[100] animate-in slide-in-from-top-2 duration-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-800">Thông báo</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {unreadCount > 0 ? `${unreadCount} chưa đọc` : 'Không có thông báo mới'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleMute && (
            <label className="flex items-center gap-1 cursor-pointer select-none" title={isMuted ? 'Bật popup thông báo' : 'Tắt popup thông báo'}>
              <input
                type="checkbox"
                checked={!isMuted}
                onChange={onToggleMute}
                className="rounded accent-emerald-600 w-3 h-3"
              />
              <span className={`text-[9px] font-black uppercase tracking-wider ${isMuted ? 'text-slate-400' : 'text-emerald-600'}`}>
                {isMuted ? '🔕' : '🔔'}
              </span>
            </label>
          )}
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-[10px] font-black text-emerald-600 uppercase tracking-wider hover:text-emerald-700"
            >
              Đọc hết
            </button>
          )}
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-lg">✕</button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {notifications.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-3xl mb-2">🔔</p>
            <p className="text-xs text-slate-400 font-bold">Chưa có thông báo nào</p>
          </div>
        ) : (
          notifications.map(notif => (
            <button
              key={notif.id}
              onClick={() => onNotificationClick(notif)}
              className={`w-full text-left px-5 py-3.5 transition-all hover:bg-slate-50 flex items-start gap-3 ${
                !notif.read ? 'bg-emerald-50/50' : ''
              }`}
            >
              <span className="text-xl shrink-0 mt-0.5">{getIcon(notif.type)}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs leading-relaxed ${!notif.read ? 'font-black text-slate-800' : 'font-bold text-slate-600'}`}>
                  {notif.message}
                </p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">{formatTime(notif.timestamp)}</p>
              </div>
              {!notif.read && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0 mt-2" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
});

NotificationPanel.displayName = 'NotificationPanel';
export default NotificationPanel;