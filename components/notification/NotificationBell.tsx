import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { User } from '../../types.ts';
import NotificationPanel, { NotificationItem } from './NotificationPanel.tsx';
import { useToast } from '../system/ToastProvider.tsx';

interface NotificationBellProps {
  currentUser: User;
  onNavigate?: (tab: string, data?: any) => void;
}

const POLL_INTERVAL = 30000; // Poll mỗi 30 giây
const SEEN_NOTIFS_KEY = 'lucky_hub_seen_notifications';

const NotificationBell: React.FC<NotificationBellProps> = memo(({ currentUser, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const { addToast, isMuted, setMuted } = useToast();
  const prevUnreadRef = useRef<number>(0);

  // Lấy danh sách ID đã "seen" (đã hiển thị popup) từ localStorage
  const getSeenIds = useCallback((): Set<string> => {
    try {
      const saved = localStorage.getItem(`${SEEN_NOTIFS_KEY}_${currentUserId}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  }, [currentUserId]);

  // Lưu ID đã seen
  const addSeenIds = useCallback((ids: string[]) => {
    try {
      const seen = getSeenIds();
      ids.forEach(id => seen.add(id));
      localStorage.setItem(`${SEEN_NOTIFS_KEY}_${currentUserId}`, JSON.stringify(Array.from(seen)));
    } catch { /* ignore */ }
  }, [currentUserId, getSeenIds]);

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
          // Fix bug: dùng Set seenIds để tránh popup lại thông báo cũ
          const prevUnread = prevUnreadRef.current;
          const newUnread = data.filter(n => !n.read).length;
          const seenIds = getSeenIds();
          
          if (newUnread > prevUnread && !isMuted) {
            const freshNotifs = data.filter(n => !n.read && !seenIds.has(n.id));
            if (freshNotifs.length > 0) {
              const latest = freshNotifs[freshNotifs.length - 1];
              addToast({
                type: 'info',
                title: 'Thông báo mới',
                message: latest.message?.substring(0, 120),
                duration: 4000,
              });
              // Đánh dấu là đã seen
              addSeenIds(freshNotifs.map(n => n.id));
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
  }, [currentUserId, addToast, isMuted, getSeenIds, addSeenIds]);

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

  // Listen for real-time notifications via WS
  useEffect(() => {
    const handleNewNotif = (e: CustomEvent) => {
      const detail = e.detail;
      if (detail && detail.userId === currentUserId) {
        // Trigger fetch immediately
        fetchNotifications();
      }
    };
    window.addEventListener('notification:received' as any, handleNewNotif as any);
    return () => window.removeEventListener('notification:received' as any, handleNewNotif as any);
  }, [currentUserId, fetchNotifications]);

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
      const sessionId = localStorage.getItem('lucky_hub_session');
      const resp = await fetch(`/api/notifications/read-all/${currentUserId}`, { 
        method: 'PUT',
        headers: sessionId ? { 'Authorization': `Bearer ${sessionId}` } : {}
      });
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
    // Đóng panel ngay lập tức để UI không bị delay
    setIsOpen(false);

    // Gọi API mark read TRƯỚC - await để đảm bảo thành công
    try {
      const sessionId = localStorage.getItem('lucky_hub_session');
      const resp = await fetch(`/api/notifications/${notif.id}/read`, { 
        method: 'PUT',
        headers: sessionId ? { 'Authorization': `Bearer ${sessionId}` } : {}
      });
      if (resp.ok) {
        setNotifications(prev => prev.map(n =>
          n.id === notif.id ? { ...n, read: true } : n
        ));
        console.log(`[NotificationBell] Marked notification ${notif.id} as read`);
      } else {
        // Nếu API lỗi (404, server error), không update state
        console.error(`[NotificationBell] MarkRead failed: ${resp.status} ${resp.statusText}`);
      }
    } catch (err: any) {
      console.error('[NotificationBell] MarkRead network error:', err);
      // Không update state nếu lỗi mạng - lần fetch tiếp theo sẽ khắc phục
    }

    // Navigate dựa trên type và link
    if (notif.link) {
      if (notif.link.startsWith('/posts/')) {
        const postId = notif.link.replace('/posts/', '');
        // Chuyển tab community trước
        if (onNavigate) onNavigate('community');
        // Dispatch event để App.tsx bắt và mở PostDetail modal
        window.dispatchEvent(new CustomEvent('navigate:post', { 
          detail: { postId } 
        }));
      } else if (notif.link === '/goals' || notif.type === 'goal_completed' || notif.type === 'goal_reminder') {
        if (onNavigate) onNavigate('dashboard');
      } else if (notif.link.startsWith('/chat/')) {
        if (onNavigate) onNavigate('chat');
      } else if (notif.link === '/metrics') {
        if (onNavigate) onNavigate('metrics');
      }
      console.log('[NotificationBell] Navigate to:', notif.link);
    }
  }, [onNavigate]);

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