
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import ChatSystem from './components/ChatSystem.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import MetricForm from './components/MetricForm.tsx';
import Profile from './components/Profile.tsx';
import MetricsManagement from './components/MetricsManagement.tsx';
import NewsFeed from './components/NewsFeed.tsx';
import BadgeCongratulation from './components/BadgeCongratulation.tsx';
import Login from './components/auth/Login.tsx';
import Register from './components/auth/Register.tsx';
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
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [existingMetrics, setExistingMetrics] = useState<HealthMetric[]>([]);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
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
      setKnowledge(k || []);
      setRules(r || []);
      if (currentUser) {
        const uid = (currentUser as any).id || (currentUser as any)._id;
        const m = await Database.getMetrics(uid);
        setExistingMetrics(m || []);
      }
    } catch (err) {}
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser, refreshTrigger]);

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
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 relative">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg">🍀</div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight uppercase" style={{ fontFamily: "'Tilt Prism', cursive" }}>LUCKY HUB</h1>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.3em] mt-2">Nền tảng Sức khỏe</p>
          </div>
          {isRegistering ? (
            <Register onRegister={handleRegister} onSwitchLogin={() => setIsRegistering(false)} isLoading={isLoading} emailError={emailError} onCheckEmail={(e) => {}} />
          ) : (
            <Login onLogin={handleLogin} onSwitchRegister={() => setIsRegistering(true)} isLoading={isLoading} />
          )}
        </div>
        <SystemLog />
      </div>
    );
  }

  return (
    <Layout user={currentUser!} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser!} users={users} onAddMetric={() => handleOpenMetricForm()} refreshTrigger={refreshTrigger} />}
      {activeTab === 'community' && <NewsFeed currentUser={currentUser!} />}
      {activeTab === 'metrics' && <MetricsManagement user={currentUser!} users={users} onAddMetric={(uid) => handleOpenMetricForm(uid)} refreshTrigger={refreshTrigger} />}
      {activeTab === 'profile' && <Profile user={currentUser!} onNavigateToAdmin={() => setActiveTab('admin')} onUpdate={async (d) => { const uid = (currentUser as any).id || (currentUser as any)._id; const u = await Database.updateUser(uid, d); if(u) { setCurrentUser(u); localStorage.setItem('lucky_hub_user', JSON.stringify(u)); } }} />}
      {activeTab === 'admin' && currentUser!.role === UserRole.ADMIN && <AdminPanel currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
      
      {isChatOpen && <ChatSystem currentUser={currentUser!} users={users} knowledge={knowledge} rules={rules} onClose={() => setIsChatOpen(false)} />}
      
      <div className="fixed bottom-6 right-6 flex flex-col gap-4 z-[1000]">
        {!isChatOpen && (
          <button 
            onClick={() => setIsChatOpen(true)} 
            className="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all border-4 border-white"
          >
            💬
          </button>
        )}
      </div>

      <SystemLog />

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
