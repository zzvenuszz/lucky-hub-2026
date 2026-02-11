
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
  }, []);

  useEffect(() => {
    Database.checkHealth();
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try { setCurrentUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('lucky_hub_user'); }
    }
    const remembered = localStorage.getItem('remembered_login');
    if (remembered) {
      try {
        const decoded = JSON.parse(atob(remembered));
        // Tự động load login data cho form
      } catch (e) {}
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
        if (data.rememberMe) localStorage.setItem('remembered_login', btoa(JSON.stringify({username: data.username, password: data.password})));
        else localStorage.removeItem('remembered_login');
      } else alert(result.message || 'Sai thông tin');
    } catch { alert('Lỗi kết nối Server'); } finally { setIsLoading(false); }
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
        alert('Đăng ký thành công!');
        setIsRegistering(false);
      } else {
        const res = await response.json();
        alert(res.message || 'Lỗi đăng ký');
      }
    } catch { alert('Lỗi kết nối'); } finally { setIsLoading(false); }
  };

  const checkEmailExists = async (email: string) => {
    if (!email) { setEmailError('Email là bắt buộc'); return; }
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      });
      const data = await res.json();
      if (data.exists) setEmailError('Email này đã được sử dụng');
      else setEmailError(null);
    } catch { console.error('Lỗi check email'); }
  };

  const handleOpenMetricForm = (targetId?: string) => {
    const uid = (currentUser as any).id || (currentUser as any)._id;
    setMetricTargetUserId(targetId || uid);
    setIsAddingMetric(true);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-4 shadow-lg animate-bounce">🍀</div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Lucky Hub</h1>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-2">Nền tảng Sức khỏe</p>
          </div>
          {isRegistering ? (
            <Register onRegister={handleRegister} onSwitchLogin={() => setIsRegistering(false)} isLoading={isLoading} emailError={emailError} onCheckEmail={checkEmailExists} />
          ) : (
            <Login onLogin={handleLogin} onSwitchRegister={() => setIsRegistering(true)} isLoading={isLoading} />
          )}
        </div>
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
      {!isChatOpen && <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[1000] border-4 border-white">💬</button>}
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
      }} existingDates={existingMetrics.map(m => m.date)} onClose={() => setIsAddingMetric(false)} />}
      {newEarnedBadge && <BadgeCongratulation badge={newEarnedBadge} onClose={() => setNewEarnedBadge(null)} />}
    </Layout>
  );
};

export default App;
