import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { User } from '../../types.ts';
import NotificationPanel, { NotificationItem } from './NotificationPanel.tsx';
import { useToast } from '../system/ToastProvider.tsx';

interface NotificationBellProps {
  currentUser: User;
}

const POLL_INTERVAL = 30000; // Poll mỗi 30 giây

const NotificationBell: React.FC<NotificationBellProps> = memo(({ currentUser }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const { addToast, isMuted, setMuted } = useToast();
  const prevUnreadRef = useRef<number>(0);

  // Fetch notifications từ API
  const fetchNotifications = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoading(true);
    try {
      const sessionId = localStorage.getItem('lucky_hub_session');
      const resp = await fetch(`/api/notifications/${currentUserId}`, {
        headers: sessionId ? { 'Authorization': `Bearer ${sessionId}` } : {}
      });
      if (resp.ok) {
        const data: NotificationItem[] = await resp.json();
        setNotifications(prev => {
          // Phát hiện notification mới để show popup (nếu không mute)
          const prevUnread = prevUnreadRef.current;
          const newUnread = data.filter(n => !n.read).length;
          if (newUnread > prevUnread && !isMuted) {
            const newNotifs = data.filter(n => !n.read);
            // So sánh với prev để tìm cái mới
            const prevIds = new Set(prev.map(n => n.id));
            const freshNotifs = newNotifs.filter(n => !prevIds.has(n.id));
            if (freshNotifs.length > 0) {
              const latest = freshNotifs[freshNotifs.length - 1];
              addToast({
                type: 'info',
                title: 'Thông báo mới',
                message: latest.message?.substring(0, 120),
                duration: 4000,
              });
            }
          }
          prevUnreadRef.current = newUnread;
          return data;
        });
        console.log(`[NotificationBell] Fetched ${data.length} notifications, unread: ${data.filter(n => !n.read).length}`);
      }
    } catch (err: any) {
      console.error('[NotificationBell] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, addToast, isMuted]);

  // Fetch khi mount + polling định kỳ
  useEffect(() => {
    fetchNotifications();
    pollTimerRef.current = window.setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchNotifications]);

  // Close panel khi click outside
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

  // Lọc bỏ notification type 'message' (tin nhắn chat) vì chat đã có badge riêng
  const chatFilteredNotifications = useMemo(() => 
    notifications.filter(n => n.type !== 'message'), 
  [notifications]);
  const unreadCount = chatFilteredNotifications.filter(n => !n.read).length;

  // Mark all as read qua API
  const handleMarkAllRead = useCallback(async () => {
    try {
      const resp = await fetch(`/api/notifications/read-all/${currentUserId}`, { method: 'PUT' });
      if (resp.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        console.log('[NotificationBell] Marked all as read');
      }
    } catch (err: any) {
      console.error('[NotificationBell] MarkAllRead error:', err);
    }
  }, [currentUserId]);

  // Mark single notification as read + navigate
  const handleNotificationClick = useCallback(async (notif: NotificationItem) => {
    // Mark as read via API
    try {
      await fetch(`/api/notifications/${notif.id}/read`, { method: 'PUT' });
      setNotifications(prev => prev.map(n =>
        n.id === notif.id ? { ...n, read: true } : n
      ));
    } catch (err: any) {
      console.error('[NotificationBell] MarkRead error:', err);
    }
    setIsOpen(false);

    // Navigate nếu có link
    if (notif.link) {
      // Có thể trigger tab switch hoặc navigation ở đây
      console.log('[NotificationBell] Navigate to:', notif.link);
    }
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
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-lg">{isMuted ? '🔕' : '🔔'}</span>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <NotificationPanel
            notifications={chatFilteredNotifications}
            onMarkAllRead={handleMarkAllRead}
            onNotificationClick={handleNotificationClick}
            onClose={handleClose}
            isMuted={isMuted}
            onToggleMute={() => setMuted(!isMuted)}
          />
        </>
      )}
    </div>
  );
});

NotificationBell.displayName = 'NotificationBell';
export default NotificationBell;