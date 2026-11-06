import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { User } from '../../types.ts';
import NotificationPanel, { NotificationItem } from './NotificationPanel.tsx';
import { useToast } from '../system/ToastProvider.tsx';
import wsService from '../../services/wsService.ts';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationCategory,
  NotificationCategory,
  NotificationPreferences,
} from './notificationCategories.ts';

interface NotificationBellProps {
  currentUser: User;
  onNavigate?: (tab: string, data?: any) => void;
}

const POLL_INTERVAL = 12000;

const NotificationBell: React.FC<NotificationBellProps> = memo(({ currentUser, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const preferencesRef = useRef<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<number | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const fetchingRef = useRef(false);
  const currentUserId = String((currentUser as any).id || (currentUser as any)._id || '');
  const { addToast } = useToast();

  useEffect(() => {
    knownIdsRef.current = new Set();
    hasLoadedRef.current = false;
    preferencesRef.current = DEFAULT_NOTIFICATION_PREFERENCES;
    setNotifications([]);
    setPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
  }, [currentUserId]);

  const fetchPreferences = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const response = await fetch('/api/notifications/preferences', { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const loadedPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(result.preferences || {}) };
      preferencesRef.current = loadedPreferences;
      setPreferences(loadedPreferences);
      console.log('[NotificationBell] Loaded account notification preferences');
    } catch (error) {
      console.error('[NotificationBell] Preference fetch error:', error);
    }
  }, [currentUserId]);

  const fetchNotifications = useCallback(async () => {
    if (!currentUserId || fetchingRef.current) return;
    fetchingRef.current = true;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notifications/${currentUserId}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: NotificationItem[] = await response.json();
      const data = (Array.isArray(result) ? result : [])
        .filter(item => item.type !== 'message')
        .sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime());

      if (hasLoadedRef.current) {
        const seenIds = new Set<string>();
        try {
          const stored = localStorage.getItem(`lucky_hub_seen_notifications_${currentUserId}`);
          if (stored) JSON.parse(stored).forEach((id: string) => seenIds.add(id));
        } catch { /* ignore invalid local cache */ }

        const freshEnabled = data.filter(item =>
          !item.read && !knownIdsRef.current.has(item.id) && preferencesRef.current[getNotificationCategory(item.type)] && !seenIds.has(item.id)
        );
        freshEnabled.forEach(item => {
          addToast({ type: 'info', title: 'Thông báo mới', message: item.message?.substring(0, 120), duration: 4000 });
          window.dispatchEvent(new CustomEvent('notification:received', { detail: { ...item, userId: currentUserId } }));
        });
        if (freshEnabled.length) {
          try {
            freshEnabled.forEach(item => seenIds.add(item.id));
            localStorage.setItem(`lucky_hub_seen_notifications_${currentUserId}`, JSON.stringify(Array.from(seenIds).slice(-300)));
          } catch { /* ignore storage errors */ }
        }
      }

      knownIdsRef.current = new Set(data.map(item => item.id));
      hasLoadedRef.current = true;
      setNotifications(data);
      console.log(`[NotificationBell] Synced ${data.length} notifications; enabled unread: ${data.filter(item => !item.read && preferencesRef.current[getNotificationCategory(item.type)]).length}`);
    } catch (error) {
      console.error('[NotificationBell] Fetch error:', error);
    } finally {
      fetchingRef.current = false;
      setIsLoading(false);
    }
  }, [currentUserId, addToast]);

  const syncNotifications = useCallback(async () => {
    await fetchPreferences();
    await fetchNotifications();
  }, [fetchNotifications, fetchPreferences]);

  useEffect(() => {
    syncNotifications();
    pollTimerRef.current = window.setInterval(syncNotifications, POLL_INTERVAL);
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        syncNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [syncNotifications]);

  useEffect(() => {
    const handleRealtimeNotification = (data: any) => {
      if (data?.userId && data.userId !== currentUserId) return;
      console.log('[NotificationBell] WebSocket notification received; syncing inbox');
      fetchNotifications();
      window.setTimeout(fetchNotifications, 500);
    };
    return wsService.on('notification:new', handleRealtimeNotification);
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = useMemo(() => notifications.filter(item =>
    !item.read && preferences[getNotificationCategory(item.type)]
  ).length, [notifications, preferences]);
  const visibleNotifications = useMemo(() => notifications.filter(item =>
    preferences[getNotificationCategory(item.type)]
  ), [notifications, preferences]);

  const handleToggleCategory = useCallback(async (category: NotificationCategory) => {
    const previousValue = preferencesRef.current[category];
    const nextValue = !previousValue;
    const optimistic = { ...preferencesRef.current, [category]: nextValue };
    preferencesRef.current = optimistic;
    setPreferences(optimistic);
    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: { [category]: nextValue } }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      console.log(`[NotificationBell] ${category} notifications ${nextValue ? 'enabled' : 'disabled'} for account`);
    } catch (error) {
      const reverted = { ...preferencesRef.current, [category]: previousValue };
      preferencesRef.current = reverted;
      setPreferences(reverted);
      addToast({ type: 'error', title: 'Không lưu được tùy chọn', message: 'Kiểm tra kết nối rồi thử lại.', duration: 4500 });
      console.error(`[NotificationBell] Failed to update ${category} preference:`, error);
    }
  }, [addToast]);

  const handleMarkAllRead = useCallback(async () => {
    const unreadEnabled = notifications.filter(item => !item.read && preferences[getNotificationCategory(item.type)]);
    const results = await Promise.all(unreadEnabled.map(async item => {
      try {
        const response = await fetch(`/api/notifications/${item.id}/read`, { method: 'PUT', credentials: 'same-origin' });
        return response.ok ? item.id : null;
      } catch (error) {
        console.error('[NotificationBell] MarkRead error:', error);
        return null;
      }
    }));
    const readIds = new Set(results.filter((id): id is string => Boolean(id)));
    setNotifications(previous => previous.map(item => readIds.has(item.id) ? { ...item, read: true } : item));
    console.log(`[NotificationBell] Marked ${readIds.size} enabled notifications as read`);
  }, [notifications, preferences]);

  const handleNotificationClick = useCallback(async (notification: NotificationItem) => {
    setIsOpen(false);
    try {
      const response = await fetch(`/api/notifications/${notification.id}/read`, { method: 'PUT', credentials: 'same-origin' });
      if (response.ok) setNotifications(previous => previous.map(item => item.id === notification.id ? { ...item, read: true } : item));
      else console.error(`[NotificationBell] MarkRead failed: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.error('[NotificationBell] MarkRead network error:', error);
    }

    if (!notification.link) return;
    if (notification.link.startsWith('/posts/')) {
      const postId = notification.link.replace('/posts/', '');
      onNavigate?.('community');
      window.dispatchEvent(new CustomEvent('navigate:post', { detail: { postId } }));
    } else if (notification.link === '/goals' || notification.type === 'goal_completed' || notification.type === 'goal_reminder') {
      onNavigate?.('dashboard');
    } else if (notification.link === '/metrics') {
      onNavigate?.('metrics');
    }
    console.log('[NotificationBell] Navigate to:', notification.link);
  }, [onNavigate]);

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        onClick={() => setIsOpen(open => !open)}
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
        aria-expanded={isOpen}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
        title="Thông báo"
      >
        {isLoading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" /> : <span className="text-lg">🔔</span>}
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-lg">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <NotificationPanel
          notifications={visibleNotifications}
          preferences={preferences}
          onToggleCategory={handleToggleCategory}
          onMarkAllRead={handleMarkAllRead}
          onNotificationClick={handleNotificationClick}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
});

NotificationBell.displayName = 'NotificationBell';
export default NotificationBell;
