
import React, { useState, useEffect, useCallback } from 'react';
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

const AUTO_LOGOUT_TIME = 15 * 60 * 1000; 

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
    setIsLogOpen(false);
    if (window.debugLog) window.debugLog(`Người dùng đã đăng xuất`, "auth");
  }, []);

  useEffect(() => {
    Database.checkHealth();
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try { setCurrentUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('lucky_hub_user'); }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    let timeoutId: number;
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleLogout, AUTO_LOGOUT_TIME);
    };
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();
    return () => {
      events.forEach(event => window.removeEventListener(event, resetTimer));
      if (timeoutId) clearTimeout(timeoutId);
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
        localStorage.setItem('lucky_hub_user', JSON.stringify(result));
        if (window.debugLog) window.debugLog(`Đăng nhập thành công: @${result.username}`, "auth");
      } else {
        if (window.debugLog) window.debugLog(`Đăng nhập thất bại: ${result.message}`, "error");
        alert(result.message || 'Sai thông tin');
      }
    } catch (err: any) { 
      if (window.debugLog) window.debugLog(`Lỗi kết nối Login: ${err.message}`, "error");
      alert('Lỗi kết nối Server'); 
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

  if (!currentUser) {
    return <AuthContainer onLogin={handleLogin} isLoading={isLoading} />;
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
