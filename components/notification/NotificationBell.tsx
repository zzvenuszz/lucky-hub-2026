import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { User } from '../../types.ts';
import { Database } from '../../services/database.ts';
import NotificationPanel, { NotificationItem } from './NotificationPanel.tsx';

interface NotificationBellProps {
  currentUser: User;
}

const LS_NOTIFICATIONS = 'lucky_hub_notifications';

const NotificationBell: React.FC<NotificationBellProps> = memo(({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load notifications from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_NOTIFICATIONS);
      if (saved) {
        setNotifications(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage whenever notifications change
  useEffect(() => {
    localStorage.setItem(LS_NOTIFICATIONS, JSON.stringify(notifications));
  }, [notifications]);

  // Add initial sample notifications for demo purposes
  useEffect(() => {
    if (notifications.length === 0 && currentUser) {
      const initialNotifs: NotificationItem[] = [
        {
          id: 'welcome',
          type: 'system',
          message: `Chào mừng ${currentUser.fullName} đến với Lucky Hub!`,
          timestamp: new Date().toISOString(),
          read: false
        }
      ];
      setNotifications(initialNotifs);
    }
  }, [currentUser, notifications.length]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const handleNotificationClick = useCallback((notif: NotificationItem) => {
    // Mark as read
    setNotifications(prev => prev.map(n => 
      n.id === notif.id ? { ...n, read: true } : n
    ));
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isOpen 
            ? 'bg-emerald-100 text-emerald-600' 
            : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
        }`}
        title="Thông báo"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <NotificationPanel
          notifications={notifications}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onClose={handleClose}
        />
      )}
    </div>
  );
});

NotificationBell.displayName = 'NotificationBell';
export default NotificationBell;