
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
import { User, UserRole, AIRule, HealthMetric, Badge } from './types.ts';
import { Database, BADGES_DB } from './services/database.ts';

// Hằng số thời gian logout
const LOGOUT_REMEMBER = 7 * 24 * 60 * 60 * 1000;  // 7 ngày nếu "Duy trì đăng nhập"
const LOGOUT_NO_REMEMBER = 15 * 60 * 1000;        // 15 phút nếu không

// Key lưu trong localStorage
const LS_USER = 'lucky_hub_user';
const LS_REMEMBER = 'lucky_hub_remember';
const LS_LOGIN_TIME = 'lucky_hub_login_time';

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
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_REMEMBER);
    localStorage.removeItem(LS_LOGIN_TIME);
    setActiveTab('dashboard');
    setIsChatOpen(false);
    setIsLogOpen(false);
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
    if (window.debugLog) window.debugLog(`Người dùng đã đăng xuất`, "auth");
  }, []);

  // Kiểm tra session hết hạn khi mount
  useEffect(() => {
    Database.checkHealth();
    const savedUser = localStorage.getItem(LS_USER);
    const savedRemember = localStorage.getItem(LS_REMEMBER) === 'true';
    const savedLoginTime = parseInt(localStorage.getItem(LS_LOGIN_TIME) || '0', 10);
    
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
        alert('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
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
      const [u, k, r] = await Promise.all([
        Database.getUsers(), 
        Database.getKnowledge(),
        Database.getRules()
      ]);
      setUsers(u || []);
      if (window.debugLog) window.debugLog(`[App] Nhận dữ liệu: ${u?.length || 0} users, ${k?.length || 0} kiến thức, ${r?.length || 0} quy tắc`, "system");
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

  useEffect(() => {
    if (isChatOpen && currentUser) {
      fetchData();
    }
  }, [isChatOpen, currentUser]);

  const handleLogin = async (data: any) => {
    setLoginError(null);
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
        
        localStorage.setItem(LS_USER, JSON.stringify(result));
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
      } else {
        // Sai mật khẩu
        let errorMsg = result.message || 'Sai thông tin đăng nhập';
        if (result.remainingAttempts !== undefined) {
          errorMsg += ` - Còn ${result.remainingAttempts} lần thử.`;
        }
        if (window.debugLog) window.debugLog(`Đăng nhập thất bại: ${result.message}`, "error");
        setLoginError(errorMsg);
      }
    } catch (err: any) { 
      if (window.debugLog) window.debugLog(`Lỗi kết nối Login: ${err.message}`, "error");
      setLoginError('Lỗi kết nối Server');
    } finally { setIsLoading(false); }
  };

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
        alert('Đăng ký thành công!');
        setIsRegistering(false);
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
    return <AuthContainer onLogin={handleLogin} isLoading={isLoading} onRegister={handleRegister} emailError={emailError} onCheckEmail={handleCheckEmail} errorMessage={loginError} />;
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
      
      {isChatOpen && <ChatSystem currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} onClose={() => setIsChatOpen(false)} />}
      
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
