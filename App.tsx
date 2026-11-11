import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from './components/system/WorkspaceShell.tsx';
import Dashboard from './components/dashboard/Dashboard.tsx';
import ChatSystem from './components/chat/index.tsx';
import ChatProvider from './components/chat/ChatProvider.tsx';
import AdminPanel from './components/admin/AdminPanel.tsx';
import MetricForm from './components/dashboard/MetricForm.tsx';
import Profile from './components/profile/Profile.tsx';
import MetricsManagement from './components/dashboard/MetricsManagement.tsx';
import NewsFeed from './components/newsfeed/NewsFeed.tsx';
import PostDetail from './components/newsfeed/PostDetail.tsx';
import BadgeCongratulation from './components/system/BadgeCongratulation.tsx';
import Login from './components/auth/Login.tsx';
import Register from './components/auth/Register.tsx';
import AuthContainer from './components/auth/AuthContainer.tsx';
import SystemLog from './components/system/SystemLog.tsx';
import BranchManager from './components/admin/nutrition/BranchManager.tsx';
import ErrorBoundary from './components/system/ErrorBoundary.tsx';
import ToastProvider from './components/system/ToastProvider.tsx';
import { ModalStackProvider } from './components/system/ModalManager.tsx';
import NDDDashboard from './components/ndd/NDDDashboard.tsx';
import InventoryDashboard, { PreselectedBuyer } from './components/inventory/InventoryDashboard.tsx';
import { User, AIRule, HealthMetric, Badge, WsEvent } from './types.ts';
import { Database, BADGES_DB } from './services/database.ts';
import { cacheManager } from './utils/cacheManager.ts';
import wsService from './services/wsService.ts';
import { DEFAULT_SYSTEM_BRANDING, SystemBranding } from './utils/systemBranding.ts';

// Session không ghi nhớ hết hạn sau 15 phút không hoạt động.
const SESSION_IDLE_TIMEOUT = 15 * 60 * 1000;

// Key lưu trong localStorage
const LS_USER = 'lucky_hub_user';
const LEGACY_LS_SESSION = 'lucky_hub_session';
const LS_REMEMBER = 'lucky_hub_remember';
const LS_LOGIN_TIME = 'lucky_hub_login_time';
const LS_AUTH_EVENT = 'lucky_hub_auth_event';

// Session ping interval: 30 giây
const SESSION_PING_INTERVAL = 30000;

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [systemBranding, setSystemBranding] = useState<SystemBranding>(DEFAULT_SYSTEM_BRANDING);
  const expireTimerRef = useRef<number | null>(null);
  const loginTimestampRef = useRef<number | null>(null);
  const rememberMeRef = useRef<boolean>(false);
  const logoutRequestRef = useRef<Promise<void> | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [preselectedSaleBuyer, setPreselectedSaleBuyer] = useState<PreselectedBuyer | null>(null);
  const [saleCartShortcut, setSaleCartShortcut] = useState<{ count: number; onClick: () => void } | null>(null);
  const handleSaleCartShortcutChange = useCallback((shortcut: { count: number; onClick: () => void } | null) => setSaleCartShortcut(shortcut), []);
  const handleQuickCreateOrderFromNdd = useCallback((buyer: PreselectedBuyer) => {
    console.log('[App] Quick create order from NDD for buyer:', buyer);
    setPreselectedSaleBuyer(buyer);
    setActiveTab('inventory');
  }, []);
  const handleConsumePreselectedBuyer = useCallback(() => {
    setPreselectedSaleBuyer(null);
  }, []);
  const [isRegistering, setIsRegistering] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [isAddingMetric, setIsAddingMetric] = useState(false);
  const [metricTargetUserId, setMetricTargetUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [existingMetrics, setExistingMetrics] = useState<HealthMetric[]>([]);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<string | null>(null);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);
  const [viewingPostId, setViewingPostId] = useState<string | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const activityPingTimeRef = useRef<number>(0);

  useEffect(() => {
    let isMounted = true;
    let hasReceivedBrandUpdate = false;
    const loadBranding = async () => {
      try {
        const response = await fetch('/api/system/branding');
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể tải thông tin thương hiệu.');
        if (isMounted && !hasReceivedBrandUpdate) setSystemBranding({ ...DEFAULT_SYSTEM_BRANDING, ...data });
      } catch (error) {
        console.error('[SystemBranding] Public configuration load failed:', error);
      }
    };
    const handleBrandingUpdate = (event: Event) => {
      const branding = (event as CustomEvent<SystemBranding>).detail;
      if (branding) {
        hasReceivedBrandUpdate = true;
        setSystemBranding({ ...DEFAULT_SYSTEM_BRANDING, ...branding });
      }
    };

    loadBranding();
    window.addEventListener('system-branding-updated', handleBrandingUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('system-branding-updated', handleBrandingUpdate);
    };
  }, []);

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (favicon) favicon.href = systemBranding.logoUrl || '/favicon/luckyhub.png';
  }, [systemBranding.logoUrl]);

  const handleLogout = useCallback((reason?: string, preserveStoredLogin = false, revokeServerSession = true) => {
    if (revokeServerSession) {
      const logoutRequest = fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
      }).then((response) => {
        if (!response.ok) throw new Error(`Logout request failed: ${response.status}`);
      }).catch((error) => {
        console.error('[Auth] Server logout failed:', error);
      });
      logoutRequestRef.current = logoutRequest;
    }

    setCurrentUser(null);
    localStorage.removeItem(LEGACY_LS_SESSION);
    if (!preserveStoredLogin) {
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(LS_REMEMBER);
      localStorage.removeItem(LS_LOGIN_TIME);
      if (reason !== 'session_invalidated' && reason !== 'session_expired') {
        localStorage.setItem(LS_AUTH_EVENT, JSON.stringify({ type: 'logout', at: Date.now() }));
      }
    }
    setActiveTab('dashboard');
    setIsChatOpen(false);
    setIsLogOpen(false);
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (window.debugLog) window.debugLog(`Người dùng đã đăng xuất${reason ? ': ' + reason : ''}`, "auth");
    
    // Nếu bị đá do đăng nhập từ thiết bị khác, hiển thị cảnh báo đặc biệt
    if (reason === 'session_invalidated') {
      alert(
        '⚠️ Tài khoản của bạn đã được đăng nhập từ thiết bị khác.\n\n' +
        'Nếu không phải bạn đang đăng nhập, hãy đổi mật khẩu ngay để bảo vệ tài khoản.\n\n' +
        'Vui lòng đăng nhập lại.'
      );
    }
  }, []);

  // Restore the saved profile only after confirming the browser cookie is valid.
  useEffect(() => {
    Database.checkHealth();
    const savedUser = localStorage.getItem(LS_USER);
    const savedRemember = localStorage.getItem(LS_REMEMBER) === 'true';
    const savedLoginTime = parseInt(localStorage.getItem(LS_LOGIN_TIME) || '0', 10);

    if (!savedUser) return;
    if (!savedRemember && savedLoginTime > 0 && Date.now() - savedLoginTime >= SESSION_IDLE_TIMEOUT) {
      console.log('[App] Session expired after inactivity');
      handleLogout('session_expired');
      return;
    }

    let cachedUser: User;
    try {
      cachedUser = JSON.parse(savedUser);
    } catch (error) {
      console.error('[Auth] Saved user data is invalid:', error);
      handleLogout('invalid_saved_user');
      return;
    }

    rememberMeRef.current = savedRemember;
    loginTimestampRef.current = savedLoginTime || Date.now();

    (async () => {
      try {
        const legacySession = localStorage.getItem(LEGACY_LS_SESSION);
        if (legacySession) {
          const migrationResponse = await fetch('/api/session/migrate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${legacySession}`,
            },
            body: JSON.stringify({ rememberMe: savedRemember }),
          });
          if (!migrationResponse.ok) {
            handleLogout('session_invalidated');
            return;
          }
          localStorage.removeItem(LEGACY_LS_SESSION);
        }

        const response = await fetch('/api/users/me', { credentials: 'same-origin' });
        if (response.status === 401 || response.status === 403) {
          handleLogout('session_invalidated');
          return;
        }
        if (!response.ok) throw new Error(`Could not validate saved session: ${response.status}`);

        const serverUser = await response.json();
        setCurrentUser(serverUser);
        localStorage.setItem(LS_USER, JSON.stringify(serverUser));
        console.log(`[App] Permissions refreshed: ${serverUser.permissions?.length || 0} permissions`);
        if (window.debugLog) window.debugLog(`Permissions refreshed: ${serverUser.permissions?.length || 0} permissions`, 'auth');
      } catch (error) {
        console.warn('[App] Could not validate saved login; using cached profile:', error);
        setCurrentUser(cachedUser);
      }
    })();
  }, [handleLogout]);

  // Periodically check whether the server invalidated this browser session.
  useEffect(() => {
    if (!currentUser) return;

    const pingSession = async () => {
      try {
        const response = await fetch('/api/session/ping', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity: false }),
        });
        const data = await response.json();
        if (response.status === 401 || response.status === 403) {
          handleLogout(data.reason === 'session_invalidated' ? data.reason : 'session_expired');
        }
      } catch (error) {
        console.warn('[Session] Could not verify active session:', error);
      }
    };

    void pingSession();
    pingIntervalRef.current = window.setInterval(pingSession, SESSION_PING_INTERVAL);
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [currentUser, handleLogout]);

  // Kết nối WebSocket khi user đăng nhập
  useEffect(() => {
    if (currentUser) {
      const uid = (currentUser as any).id || (currentUser as any)._id;
      
      wsService.connect(uid);
      
      console.log(`[App] WebSocket connected for user ${uid}`);

      // NotificationBell lọc theo tùy chọn từng nhóm trước khi phát sự kiện này.
      const handleNotificationReceived = (event: Event) => {
        const data = (event as CustomEvent).detail;
        if (!data || data.userId !== uid || !data.message) return;
        console.log(`[App] New notification:`, data.message.substring(0, 50));
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Lucky Hub', { body: data.message });
        }
      };
      window.addEventListener('notification:received', handleNotificationReceived);

      return () => {
        window.removeEventListener('notification:received', handleNotificationReceived);
        wsService.disconnect();
      };
    } else {
      wsService.disconnect();
    }
  }, [currentUser]);

  // Goal reminder: kiểm tra mỗi 60 giây
  useEffect(() => {
    if (!currentUser) return;
    const uid = (currentUser as any).id || (currentUser as any)._id;

    const checkReminders = async () => {
      try {
        const result = await Database.checkGoalReminders(uid);
        if (result?.reminders?.length > 0) {
          for (const reminder of result.reminders) {
            if (reminder.overdue) {
              wsService.send(WsEvent.GOAL_REMINDER, {
                targetUserId: uid,
                goalType: reminder.type,
                daysLeft: reminder.daysLeft,
              });
            } else if (reminder.daysLeft === 3 || reminder.daysLeft === 1) {
              wsService.send(WsEvent.GOAL_REMINDER, {
                targetUserId: uid,
                goalType: reminder.type,
                daysLeft: reminder.daysLeft,
              });
            }
          }
          console.log(`[App] Goal reminders checked: ${result.reminders.length} reminders`);
        }
      } catch (err) {
        // Silent fail
      }
    };

    checkReminders();
    const reminderInterval = setInterval(checkReminders, 60000);
    return () => clearInterval(reminderInterval);
  }, [currentUser]);

  // Lắng nghe sự kiện navigate:post từ NotificationBell để mở PostDetail
  useEffect(() => {
    const handleNavigatePost = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.postId) {
        console.log(`[App] Navigate to post: ${detail.postId}`);
        setViewingPostId(detail.postId);
      }
    };
    window.addEventListener('navigate:post', handleNavigatePost as any);
    return () => window.removeEventListener('navigate:post', handleNavigatePost as any);
  }, []);

  // Lắng nghe sự kiện session bị vô hiệu hóa từ database.ts
  useEffect(() => {
    const handleSessionInvalidated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log(`[Session] Invalidated event received:`, detail);
      handleLogout(detail.reason === 'session_invalidated' ? detail.reason : 'session_expired');
    };
    
    window.addEventListener('session:invalidated', handleSessionInvalidated);
    return () => window.removeEventListener('session:invalidated', handleSessionInvalidated);
  }, [handleLogout]);

  // Sync login/logout changes between tabs without exposing the session cookie.
  useEffect(() => {
    if (!currentUser) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === LS_AUTH_EVENT && event.newValue) {
        try {
          const authEvent = JSON.parse(event.newValue);
          if (authEvent.type === 'logout') handleLogout('signed_out_in_other_tab', true, false);
        } catch (error) {
          console.error('[Auth] Could not read cross-tab auth event:', error);
        }
      }

      if (event.key === LS_USER && event.newValue) {
        try {
          const updatedUser = JSON.parse(event.newValue);
          const currentUserId = String((currentUser as any).id || (currentUser as any)._id);
          const updatedUserId = String(updatedUser.id || updatedUser._id);
          if (updatedUserId && updatedUserId !== currentUserId) {
            handleLogout('account_changed_in_other_tab', true, false);
          }
        } catch (error) {
          console.error('[Auth] Could not compare cross-tab user state:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUser, handleLogout]);

  // Renew sessions on user activity; non-remembered sessions expire after 15 idle minutes.
  useEffect(() => {
    if (!currentUser) return;

    const refreshSession = () => {
      const now = Date.now();
      const lastActivity = loginTimestampRef.current || now;
      if (!rememberMeRef.current && now - lastActivity >= SESSION_IDLE_TIMEOUT) {
        handleLogout('session_expired');
        alert('Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.');
        return;
      }

      loginTimestampRef.current = now;
      localStorage.setItem(LS_LOGIN_TIME, now.toString());
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);

      if (!rememberMeRef.current) {
        expireTimerRef.current = window.setTimeout(() => {
          if (Date.now() - (loginTimestampRef.current || 0) >= SESSION_IDLE_TIMEOUT) {
            handleLogout('session_expired');
            alert('Phiên đăng nhập đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.');
          }
        }, SESSION_IDLE_TIMEOUT);
      }

      if (now - activityPingTimeRef.current >= 15000) {
        activityPingTimeRef.current = now;
        void fetch('/api/session/ping', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activity: true }),
        }).then(async (response) => {
          const data = await response.json();
          if (response.status === 401 || response.status === 403) {
            handleLogout(data.reason === 'session_invalidated' ? data.reason : 'session_expired');
          } else if (!response.ok) {
            console.error('[Session] Activity renewal failed:', data.message || response.statusText);
          }
        }).catch((error) => {
          console.error('[Session] Activity renewal request failed:', error);
        });
      }
    };

    const events = ['pointerdown', 'mousedown', 'mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, refreshSession, { passive: true }));
    refreshSession();

    return () => {
      events.forEach((event) => window.removeEventListener(event, refreshSession));
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
    };
  }, [currentUser, handleLogout]);

  const activeUserId = currentUser ? String((currentUser as any).id || (currentUser as any)._id || '') : '';
  const fetchData = useCallback(async () => {
    // Tải độc lập song song để thời gian chờ không cộng dồn theo từng endpoint.
    let usersData: User[] = [];
    let knowledgeData: any[] = [];
    let rulesData: AIRule[] = [];

    const loadUsers = async () => {
      try { usersData = await Database.getUsers(); setUsers(usersData || []); }
      catch (err) { console.warn('[App] Failed to load users:', err); }
    };
    const loadKnowledge = async () => {
      try { knowledgeData = await Database.getKnowledge(); setKnowledge(knowledgeData || []); }
      catch (err) { console.warn('[App] Failed to load knowledge:', err); }
    };
    const loadRules = async () => {
      try { rulesData = await Database.getRules(); setRules(rulesData || []); }
      catch (err) { console.warn('[App] Failed to load rules:', err); }
    };
    const loadCurrentUser = async () => {
      try {
        const meRes = await fetch('/api/users/me', { credentials: 'same-origin' });
        if (!meRes.ok) return;
        const refreshedMe = await meRes.json();
        setCurrentUser(prev => {
          if (!prev) return refreshedMe;
          const prevPerms = JSON.stringify((prev as any).permissions || []);
          const nextPerms = JSON.stringify(refreshedMe.permissions || []);
          const prevGroup = (prev as any).groupName || '';
          const nextGroup = refreshedMe.groupName || '';
          if (prevPerms === nextPerms && prevGroup === nextGroup && prev.fullName === refreshedMe.fullName && prev.avatar === refreshedMe.avatar && prev.memberLevel === refreshedMe.memberLevel) return prev;
          const merged = { ...prev, ...refreshedMe };
          localStorage.setItem(LS_USER, JSON.stringify(merged));
          console.log(`[App] Refreshed currentUser permissions: ${refreshedMe.permissions?.length || 0}`);
          return merged;
        });
      } catch (err) { console.warn('[App] Failed to refresh currentUser:', err); }
    };
    const loadMetrics = async () => {
      if (!activeUserId) return;
      try {
        const metrics = await Database.getMetrics(activeUserId);
        setExistingMetrics(metrics || []);
        cacheManager.set(`metrics_${activeUserId}`, metrics || [], 5);
      } catch (err) { console.warn('[App] Failed to load metrics:', err); }
    };

    await Promise.all([
      loadUsers(), loadKnowledge(), loadRules(),
      ...(activeUserId ? [loadCurrentUser(), loadMetrics()] : []),
    ]);

    if (window.debugLog) window.debugLog(
      `[App] Nhận dữ liệu: ${usersData?.length || 0} users, ${knowledgeData?.length || 0} kiến thức, ${rulesData?.length || 0} quy tắc`,
      "system"
    );
  }, [activeUserId]);

  // Sử dụng useRef để lưu fetchData function, tránh stale closure trong interval
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    if (currentUser) {
      fetchDataRef.current();
      // Refresh dữ liệu mỗi 10 phút (tối ưu hóa performance)
      const mainInterval = setInterval(() => {
        fetchDataRef.current();
      }, 600000);
      return () => clearInterval(mainInterval);
    }
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId || refreshTrigger === 0) return;
    let active = true;
    Database.getMetrics(activeUserId).then(metrics => {
      if (!active) return;
      setExistingMetrics(metrics || []);
      cacheManager.set(`metrics_${activeUserId}`, metrics || [], 5);
    }).catch(err => console.warn('[App] Failed to refresh metrics:', err));
    return () => { active = false; };
  }, [activeUserId, refreshTrigger]);


  const handleLogin = async (data: any) => {
    setLoginError(null);
    setLockUntil(null);
    setIsLoading(true);
    try {
      if (logoutRequestRef.current) await logoutRequestRef.current;
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username: data.username.toLowerCase().trim(),
          password: data.password,
          rememberMe: !!data.rememberMe,
        })
      });
      const result = await response.json();
      if (response.ok) {
        setCurrentUser(result);
        setLoginError(null);
        
        // Lưu thông tin session với rememberMe
        const rememberMe = !!data.rememberMe;
        const loginTime = Date.now();
        rememberMeRef.current = rememberMe;
        loginTimestampRef.current = loginTime;
        activityPingTimeRef.current = loginTime;
        
        localStorage.setItem(LS_USER, JSON.stringify(result));
        localStorage.setItem(LS_REMEMBER, rememberMe ? 'true' : 'false');
        localStorage.setItem(LS_LOGIN_TIME, loginTime.toString());
        
        console.log(`[Login] Success, rememberMe=${rememberMe}`);
        if (window.debugLog) window.debugLog(`Đăng nhập thành công: @${result.username}${rememberMe ? ' (ghi nhớ 31 ngày, gia hạn khi sử dụng)' : ' (hết hạn sau 15 phút không hoạt động)'}`, "auth");
        
        // Gợi ý trình duyệt lưu mật khẩu - dùng Credential Management API
        try {
          if ('credentials' in navigator && typeof window.PasswordCredential !== 'undefined') {
            const cred = new (window.PasswordCredential as any)({
              id: data.username.toLowerCase().trim(),
              password: data.password,
              name: result.fullName || result.username,
            });
            await navigator.credentials.store(cred);
            console.log('[Login] Password credential saved via Credential Management API');
          }
        } catch (credErr: any) {
          // Trình duyệt không hỗ trợ hoặc user từ chối - không sao
          console.log('[Login] Credential Management API not supported or denied:', credErr?.message);
        }
      } else if (response.status === 429) {
        // Locked - quá nhiều lần đăng nhập sai
        const lockMsg = result.message || 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau.';
        if (window.debugLog) window.debugLog(`[Login] Locked: ${lockMsg}`, "error");
        setLoginError(lockMsg);
        setLockUntil(result.lockUntil || null);
      } else {
        // Sai mật khẩu
        let errorMsg = result.message || 'Sai thông tin đăng nhập';
        if (result.remainingAttempts !== undefined) {
          errorMsg += ` - Còn ${result.remainingAttempts} lần thử.`;
        }
        // Nếu bị đăng nhập từ thiết bị khác
        if (result.invalidatedOldSessions && result.invalidatedOldSessions > 0) {
          console.log(`[Login] Invalidated ${result.invalidatedOldSessions} old session(s)`);
        }
        // Nếu có lockUntil (trường hợp vừa bị lock khi sai lần thứ 5)
        if (result.locked && result.lockUntil) {
          setLockUntil(result.lockUntil);
        }
        if (window.debugLog) window.debugLog(`Đăng nhập thất bại: ${result.message}`, "error");
        setLoginError(errorMsg);
      }
    } catch (err: any) { 
      if (window.debugLog) window.debugLog(`Lỗi kết nối Login: ${err.message}`, "error");
      setLoginError('Lỗi kết nối Server');
    } finally { setIsLoading(false); }
  };

  const [isVerifyMode, setIsVerifyMode] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleRegister = async (data: any) => {
    if (emailError) return alert('Email không hợp lệ');
    setIsLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, username: data.username.toLowerCase().trim() })
      });
      if (response.ok) {
        if (window.debugLog) window.debugLog(`Đăng ký tài khoản mới thành công: @${data.username}`, "auth");
        // Lưu email đã đăng ký và chuyển sang màn hình chúc mừng
        setRegisteredEmail(data.email);
        setRegistrationSuccess(true);
      } else {
        const res = await response.json();
        if (window.debugLog) window.debugLog(`Lỗi đăng ký: ${res.message}`, "error");
        alert(res.message || 'Lỗi đăng ký');
      }
    } catch (err: any) { 
      if (window.debugLog) window.debugLog(`Lỗi mạng khi đăng ký: ${err.message}`, "error");
      alert('Lỗi kết nối'); 
    } finally { setIsLoading(false); }
  };

  const handleOpenMetricForm = (targetId?: string) => {
    const uid = (currentUser as any).id || (currentUser as any)._id;
    setMetricTargetUserId(targetId || uid);
    setIsAddingMetric(true);
  };

  const handleCheckEmail = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setEmailError(data.exists ? 'Email đã được sử dụng' : null);
    } catch {
      setEmailError(null);
    }
  }, []);

  if (!currentUser) {
    return <AuthContainer 
      onLogin={handleLogin} 
      isLoading={isLoading} 
      onRegister={handleRegister} 
      emailError={emailError} 
      onCheckEmail={handleCheckEmail} 
      errorMessage={loginError} 
      lockUntil={lockUntil}
      verifyMode={isVerifyMode}
      onBackFromVerify={() => setIsVerifyMode(false)}
      registrationSuccess={registrationSuccess}
      registeredEmail={registeredEmail}
      onClearRegistrationSuccess={() => setRegistrationSuccess(false)}
      branding={systemBranding}
    />;
  }

  const isAdmin = (currentUser as any).permissions?.includes('admin:panel');

  // ChatProvider luôn active 24/7 để lắng nghe WebSocket,
  // ChatSystem UI chỉ render khi isChatOpen = true
  return (
    <ErrorBoundary>
      <ModalStackProvider>
      <ToastProvider>
      <ChatProvider currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules}>
        <Layout user={currentUser!} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} isChatOpen={isChatOpen} onChatToggle={(open) => setIsChatOpen(previous => typeof open === 'boolean' ? open : !previous)} isSystemLogOpen={isLogOpen} onSystemLogToggle={() => setIsLogOpen(open => !open)} branding={systemBranding} saleCartShortcut={saleCartShortcut}>
        {activeTab === 'dashboard' && <Dashboard user={currentUser!} users={users} onAddMetric={(targetId) => handleOpenMetricForm(targetId)} refreshTrigger={refreshTrigger} />}
        {activeTab === 'community' && <NewsFeed currentUser={currentUser!} users={users} />}
        {activeTab === 'metrics' && <MetricsManagement user={currentUser!} users={users} onAddMetric={(uid) => handleOpenMetricForm(uid)} refreshTrigger={refreshTrigger} />}
        {activeTab === 'profile' && <Profile user={currentUser!} onMemberLevelUpdate={async (memberLevel) => {
          const uid = (currentUser as any).id || (currentUser as any)._id;
          await Database.inventory.setMemberLevel(uid, { memberLevel, reason: 'Người dùng cập nhật cấp độ từ hồ sơ cá nhân' });
          const response = await fetch('/api/users/me', { credentials: 'same-origin' });
          if (!response.ok) throw new Error('Đã lưu cấp độ nhưng không tải lại được hồ sơ.');
          const refreshedUser = await response.json();
          setCurrentUser(refreshedUser);
          localStorage.setItem('lucky_hub_user', JSON.stringify(refreshedUser));
          console.log('[Profile] Own member level updated:', { userId: uid, memberLevel });
        }} onUpdate={async (d) => {
          const uid = (currentUser as any).id || (currentUser as any)._id; 
          const u = await Database.updateUser(uid, d); 
          if(u) { 
            setCurrentUser(prev => {
              const merged = {
                ...prev,
                ...u,
                permissions: Array.isArray((u as any).permissions) ? (u as any).permissions : ((prev as any)?.permissions || []),
                groupPermissions: Array.isArray((u as any).groupPermissions) ? (u as any).groupPermissions : ((prev as any)?.groupPermissions || []),
                groupName: (u as any).groupName ?? (prev as any)?.groupName ?? '',
              } as User;
              localStorage.setItem('lucky_hub_user', JSON.stringify(merged));
              return merged;
            });
            console.log(`[Profile] User profile updated, permissions preserved: ${((u as any).permissions || (currentUser as any).permissions || []).length}`);
            if (window.debugLog) window.debugLog(`Cập nhật hồ sơ người dùng @${u.username} thành công`, "user");
          } 
        }} />}
        {activeTab === 'admin' && isAdmin && <AdminPanel currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
        {activeTab === 'ndd' && <NDDDashboard currentUser={currentUser!} onQuickCreateOrder={handleQuickCreateOrderFromNdd} />}
        {activeTab === 'systemndd' && <BranchManager />}
        {activeTab === 'inventory' && ((currentUser! as any).permissions?.includes('inventory:manage') || (currentUser! as any).permissions?.includes('inventory:sell')) && <InventoryDashboard user={currentUser!} initialBuyer={preselectedSaleBuyer} onConsumeInitialBuyer={handleConsumePreselectedBuyer} onSaleCartShortcutChange={handleSaleCartShortcutChange} />}
        {activeTab === 'inventory-reports' && ((currentUser! as any).permissions?.includes('inventory:manage') || (currentUser! as any).permissions?.includes('inventory:sell')) && <InventoryDashboard user={currentUser!} initialTab="reports" />}
        {activeTab === 'inventory-prices' && (currentUser! as any).permissions?.includes('pricelist:manage') && <InventoryDashboard user={currentUser!} initialPricesOnly />}
        {activeTab === 'member-levels' && ((currentUser! as any).permissions?.includes('members:level:manage') || (currentUser! as any).permissions?.includes('members:level:manage:any')) && <InventoryDashboard user={currentUser!} initialLevelsOnly />}
        
        {/* ChatSystem UI - chỉ hiển thị khung chat khi mở */}
        {isChatOpen && <ChatSystem currentUser={currentUser!} onClose={() => setIsChatOpen(false)} />}
        
        {/* Cửa sổ Log - CHỈ RENDER CHO ADMIN */}
        {isAdmin && <SystemLog isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />}

        {isAddingMetric && <MetricForm 
          latestMetrics={existingMetrics.length > 0 ? [...existingMetrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : undefined}
          onSave={async (m) => { 
          const actorId = (currentUser as any).id || (currentUser as any)._id;
          const targetId = metricTargetUserId || actorId;
          await Database.saveMetric({ ...m, userId: targetId, actorId, actorName: currentUser?.fullName });
          // Xóa cache metrics để Dashboard/component khác fetch dữ liệu mới
          cacheManager.remove(`metrics_${targetId}`);
          setRefreshTrigger(t => t+1); 
          setIsAddingMetric(false); 
        }} onSaveBulk={async (l) => { 
          const actorId = (currentUser as any).id || (currentUser as any)._id;
          const targetId = metricTargetUserId || actorId;
          await Database.saveMetricsBulk({
            metrics: l.map(m => ({...m, userId: targetId})),
            actorId,
            actorName: currentUser?.fullName
          });
          // Xóa cache metrics để Dashboard/component khác fetch dữ liệu mới
          cacheManager.remove(`metrics_${targetId}`);
          setRefreshTrigger(t => t+1); 
          setIsAddingMetric(false); 
        }} onClose={() => setIsAddingMetric(false)} />}
        {newEarnedBadge && <BadgeCongratulation badge={newEarnedBadge} onClose={() => setNewEarnedBadge(null)} />}
        </Layout>
        {/* PostDetail Modal - hiển thị khi click vào thông báo bài viết */}
        {viewingPostId && currentUser && (
          <PostDetail
            postId={viewingPostId}
            currentUser={currentUser}
            users={users}
            onClose={() => setViewingPostId(null)}
          />
        )}
      </ChatProvider>
      </ToastProvider>
      </ModalStackProvider>
    </ErrorBoundary>
  );
};

export default App;
