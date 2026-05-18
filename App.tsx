
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from './components/system/Layout.tsx';
import Dashboard from './components/dashboard/Dashboard.tsx';
import ChatSystem from './components/chat/ChatSystem.tsx';
import AdminPanel from './components/admin/AdminPanel.tsx';
import MetricForm from './components/dashboard/MetricForm.tsx';
import Profile from './components/profile/Profile.tsx';
import MetricsManagement from './components/dashboard/MetricsManagement.tsx';
import NewsFeed from './components/newsfeed/NewsFeed.tsx';
import BadgeCongratulation from './components/system/BadgeCongratulation.tsx';
import Login from './components/auth/Login.tsx';
import Register from './components/auth/Register.tsx';
import AuthContainer from './components/auth/AuthContainer.tsx';
import SystemLog from './components/system/SystemLog.tsx';
import CoachDashboard from './components/coach/CoachDashboard.tsx';
import { User, UserRole, AIRule, HealthMetric, Badge } from './types.ts';
import { Database, BADGES_DB } from './services/database.ts';
import { connectSocket, disconnectSocket, getSocket } from './services/socketService.ts';

// Hằng số thời gian logout
const LOGOUT_REMEMBER = 7 * 24 * 60 * 60 * 1000;  // 7 ngày nếu "Duy trì đăng nhập"
const LOGOUT_NO_REMEMBER = 15 * 60 * 1000;        // 15 phút nếu không

// Key lưu trong localStorage
const LS_USER = 'lucky_hub_user';
const LS_SESSION = 'lucky_hub_session';
const LS_REMEMBER = 'lucky_hub_remember';
const LS_LOGIN_TIME = 'lucky_hub_login_time';

// Session ping interval: 30 giây
const SESSION_PING_INTERVAL = 30000;

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const expireTimerRef = useRef<number | null>(null);
  const loginTimestampRef = useRef<number | null>(null);
  const rememberMeRef = useRef<boolean>(false);
  const [activeTab, setActiveTab] = useState('dashboard');
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
  const [preloadedChats, setPreloadedChats] = useState<any[]>([]);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState<string | null>(null);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const handleLogout = useCallback((reason?: string) => {
    setCurrentUser(null);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_SESSION);
    localStorage.removeItem(LS_REMEMBER);
    localStorage.removeItem(LS_LOGIN_TIME);
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
    sessionIdRef.current = null;
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

  // Kiểm tra session hết hạn khi mount
  useEffect(() => {
    Database.checkHealth();
    const savedUser = localStorage.getItem(LS_USER);
    const savedSession = localStorage.getItem(LS_SESSION);
    const savedRemember = localStorage.getItem(LS_REMEMBER) === 'true';
    const savedLoginTime = parseInt(localStorage.getItem(LS_LOGIN_TIME) || '0', 10);
    
    if (savedSession) {
      sessionIdRef.current = savedSession;
    }
    
    if (savedUser && savedLoginTime > 0) {
      const now = Date.now();
      const maxAge = savedRemember ? LOGOUT_REMEMBER : LOGOUT_NO_REMEMBER;
      const elapsed = now - savedLoginTime;
      
      if (elapsed >= maxAge) {
        // Session đã hết hạn
        console.log('[App] Session expired on load, logging out');
        localStorage.removeItem(LS_USER);
        localStorage.removeItem(LS_REMEMBER);
        localStorage.removeItem(LS_LOGIN_TIME);
        if (window.debugLog) window.debugLog(`Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.`, "auth");
      } else {
        try {
          setCurrentUser(JSON.parse(savedUser));
          loginTimestampRef.current = savedLoginTime;
          rememberMeRef.current = savedRemember;
          
          // Thiết lập timer logout tự động
          const remaining = maxAge - elapsed;
          if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
          expireTimerRef.current = window.setTimeout(() => {
            handleLogout();
            alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
            if (window.debugLog) window.debugLog(`Phiên đăng nhập tự động hết hạn sau ${savedRemember ? '7 ngày' : '15 phút'}`, "auth");
          }, remaining);
        } catch (e) {
          localStorage.removeItem(LS_USER);
          localStorage.removeItem(LS_REMEMBER);
          localStorage.removeItem(LS_LOGIN_TIME);
        }
      }
    }
  }, [handleLogout]);

  // Session Ping: kiểm tra session còn hiệu lực mỗi 30s
  useEffect(() => {
    if (!currentUser || !sessionIdRef.current) return;

    const pingSession = async () => {
      try {
        // QUAN TRỌNG: Luôn dùng sessionId từ ref, KHÔNG đọc từ localStorage
        // để tránh bị ghi đè khi tab khác login cùng trình duyệt
        const mySessionId = sessionIdRef.current;
        if (!mySessionId) return;
        
        const resp = await fetch('/api/session/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: mySessionId })
        });
        const data = await resp.json();
        if (!data.valid && data.reason === 'session_invalidated') {
          handleLogout('session_invalidated');
        }
      } catch {
        // Bỏ qua lỗi mạng, không ảnh hưởng
      }
    };

    pingSession(); // Ping ngay khi mount
    pingIntervalRef.current = window.setInterval(pingSession, SESSION_PING_INTERVAL);

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [currentUser, handleLogout]);

  // Kết nối Socket.IO khi user đăng nhập
  useEffect(() => {
    if (currentUser && sessionIdRef.current) {
      const uid = (currentUser as any).id || (currentUser as any)._id;
      const s = connectSocket(uid, sessionIdRef.current, currentUser.role);
      
      // Lắng nghe notification real-time
      s.on('notification:new', (data: any) => {
        console.log(`[App] New notification:`, data.message?.substring(0, 50));
        // Có thể trigger refresh notification bell ở đây
        // Hoặc hiển thị toast notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Lucky Hub', { body: data.message });
        }
      });

      // Lắng nghe session multi-tab
      s.on('session:multiTab', (data: any) => {
        console.log(`[App] Multi-tab detected:`, data.message);
      });

      console.log(`[App] Socket connected for user ${uid}`);
    } else {
      disconnectSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [currentUser]);

  // Phát hiện khi tab khác trong cùng trình duyệt login và ghi đè session
  useEffect(() => {
    if (!currentUser) return;

    const handleStorageChange = (e: StorageEvent) => {
      // Chỉ xử lý khi key LS_SESSION thay đổi
      if (e.key === LS_SESSION && e.newValue && e.newValue !== e.oldValue) {
        const mySessionId = sessionIdRef.current;
        // Nếu session trong localStorage khác với session của tab này
        // => tab khác đã login và ghi đè
        if (mySessionId && e.newValue !== mySessionId) {
          console.log(`[Session] Detected other tab login: storage session=${e.newValue.substring(0, 8)}..., my session=${mySessionId.substring(0, 8)}...`);
          handleLogout('session_invalidated');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUser, handleLogout]);

  // Cơ chế refresh session: reset timer khi có tương tác người dùng
  useEffect(() => {
    if (!currentUser) return;
    
    const refreshSession = () => {
      // Chỉ refresh khi ghi nhớ đăng nhập (session kéo dài)
      if (rememberMeRef.current) {
        const now = Date.now();
        loginTimestampRef.current = now;
        localStorage.setItem(LS_LOGIN_TIME, now.toString());
      }
      
      // Reset timer logout
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
      }
      const maxAge = rememberMeRef.current ? LOGOUT_REMEMBER : LOGOUT_NO_REMEMBER;
      const elapsed = Date.now() - (loginTimestampRef.current || Date.now());
      const remaining = Math.max(0, maxAge - elapsed);
      
      expireTimerRef.current = window.setTimeout(() => {
        handleLogout();
        if (window.debugLog) window.debugLog(`Phiên đăng nhập tự động hết hạn`, "auth");
      }, remaining);
    };
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => refreshSession();
    events.forEach(event => window.addEventListener(event, handleActivity));
    refreshSession();
    
    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
    };
  }, [currentUser, handleLogout]);

  const fetchData = async () => {
    try {
      const [u, k, r, c] = await Promise.all([
        Database.getUsers(), 
        Database.getKnowledge(),
        Database.getRules(),
        Database.getChats()
      ]);
      setUsers(u || []);
      setPreloadedChats(c || []);
      if (window.debugLog) window.debugLog(`[App] Nhận dữ liệu: ${u?.length || 0} users, ${k?.length || 0} kiến thức, ${r?.length || 0} quy tắc, ${c?.length || 0} chats`, "system");
      setKnowledge(k || []);
      setRules(r || []);
      if (currentUser) {
        const uid = (currentUser as any).id || (currentUser as any)._id;
        const m = await Database.getMetrics(uid);
        setExistingMetrics(m || []);
      }
    } catch (err) {}
  };

  useEffect(() => { 
    if (currentUser) {
      fetchData(); 
      // Refresh dữ liệu mỗi 10 phút (tối ưu hóa performance)
      const mainInterval = setInterval(fetchData, 600000);
      return () => clearInterval(mainInterval);
    }
  }, [currentUser, refreshTrigger]);


  const handleLogin = async (data: any) => {
    setLoginError(null);
    setLockUntil(null);
    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: data.username.toLowerCase().trim(), password: data.password })
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
        sessionIdRef.current = result.sessionId || null;
        
        localStorage.setItem(LS_USER, JSON.stringify(result));
        localStorage.setItem(LS_SESSION, result.sessionId || '');
        localStorage.setItem(LS_REMEMBER, rememberMe ? 'true' : 'false');
        localStorage.setItem(LS_LOGIN_TIME, loginTime.toString());
        
        console.log(`[Login] Success, rememberMe=${rememberMe}, will auto-logout in ${rememberMe ? '7 days' : '15 minutes'}`);
        if (window.debugLog) window.debugLog(`Đăng nhập thành công: @${result.username}${rememberMe ? ' (ghi nhớ 7 ngày)' : ' (15 phút)'}`, "auth");
        
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
        // Chuyển sang màn hình thông báo xác thực email
        setIsVerifyMode(true);
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
    />;
  }

  const isAdmin = currentUser.role === UserRole.ADMIN;

  return (
    <Layout user={currentUser!} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser!} users={users} onAddMetric={() => handleOpenMetricForm()} refreshTrigger={refreshTrigger} />}
      {activeTab === 'community' && <NewsFeed currentUser={currentUser!} />}
      {activeTab === 'metrics' && <MetricsManagement user={currentUser!} users={users} onAddMetric={(uid) => handleOpenMetricForm(uid)} refreshTrigger={refreshTrigger} />}
      {activeTab === 'profile' && <Profile user={currentUser!} onNavigateToAdmin={() => setActiveTab('admin')} onUpdate={async (d) => { 
        const uid = (currentUser as any).id || (currentUser as any)._id; 
        const u = await Database.updateUser(uid, d); 
        if(u) { 
          setCurrentUser(u); 
          localStorage.setItem('lucky_hub_user', JSON.stringify(u)); 
          if (window.debugLog) window.debugLog(`Cập nhật hồ sơ người dùng @${u.username} thành công`, "user");
        } 
      }} />}
      {activeTab === 'admin' && isAdmin && <AdminPanel currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
      {activeTab === 'coach' && (currentUser.role === UserRole.COACH || isAdmin) && <CoachDashboard currentUser={currentUser!} />}
      
      {isChatOpen && <ChatSystem currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} preloadedChats={preloadedChats} onClose={() => setIsChatOpen(false)} />}
      
      {/* Floating Action Buttons Stack */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-4 z-[1000]">
        {/* Nút System Log - CHỈ HIỂN THỊ CHO ADMIN */}
        {isAdmin && (
          <button 
            onClick={() => setIsLogOpen(!isLogOpen)}
            className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all border-4 border-white ${isLogOpen ? 'bg-slate-800 rotate-180' : 'bg-slate-700 hover:scale-110 active:scale-95'}`}
            title="Hệ thống Log (Admin only)"
          >
            <span className="text-xl">{isLogOpen ? '❌' : '📟'}</span>
          </button>
        )}

        {/* Nút Chat Toggle */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)} 
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all border-4 border-white ${isChatOpen ? 'bg-slate-800' : 'bg-emerald-600 text-white'}`}
        >
          <span className="text-xl">{isChatOpen ? '❌' : '💬'}</span>
        </button>
      </div>

      {/* Cửa sổ Log - CHỈ RENDER CHO ADMIN */}
      {isAdmin && <SystemLog isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} />}

      {isAddingMetric && <MetricForm onSave={async (m) => { 
        const actorId = (currentUser as any).id || (currentUser as any)._id;
        await Database.saveMetric({ ...m, userId: metricTargetUserId, actorId, actorName: currentUser?.fullName }); 
        setRefreshTrigger(t => t+1); 
        setIsAddingMetric(false); 
      }} onSaveBulk={async (l) => { 
        const actorId = (currentUser as any).id || (currentUser as any)._id;
        await Database.saveMetricsBulk({
          metrics: l.map(m => ({...m, userId: metricTargetUserId})),
          actorId,
          actorName: currentUser?.fullName
        }); 
        setRefreshTrigger(t => t+1); 
        setIsAddingMetric(false); 
      }} onClose={() => setIsAddingMetric(false)} />}
      {newEarnedBadge && <BadgeCongratulation badge={newEarnedBadge} onClose={() => setNewEarnedBadge(null)} />}
    </Layout>
  );
};

export default App;
