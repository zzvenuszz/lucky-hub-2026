
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
import { User, HealthGoal, UserRole, AccountStatus, AIRule, HealthMetric, Badge } from './types.ts';
import { Database, BADGES_DB } from './services/database.ts';

const AUTO_LOGOUT_TIME = 15 * 60 * 1000; 

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState(false); 
  const [tempUpgradeData, setTempUpgradeData] = useState<{userId: string, fullName: string} | null>(null);
  const [upgradePasswords, setUpgradePasswords] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [showUpgradePass, setShowUpgradePass] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [isAddingMetric, setIsAddingMetric] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [existingMetrics, setExistingMetrics] = useState<HealthMetric[]>([]);
  
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);

  const [regData, setRegData] = useState({
    username: '', password: '', fullName: '', phoneNumber: '',
    birthDate: '', height: 170, weight: 65,
    gender: 'Nam' as 'Nam'|'Nữ', healthGoal: HealthGoal.BODY_RECOMP
  });

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
  }, []);

  const checkBadges = useCallback((metrics: HealthMetric[], user: User): string[] => {
    const currentBadges = new Set(user.badges || []);
    if (metrics.length === 0) return Array.from(currentBadges);
    const sorted = [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime());
    const firstMetric = sorted[0];
    const latestMetric = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length; i++) {
      const dateI = new Date(sorted[i].date);
      for (let j = i + 1; j < sorted.length; j++) {
        const dateJ = new Date(sorted[j].date);
        const daysDiff = (dateJ.getTime() - dateI.getTime()) / (1000 * 3600 * 24);
        if (daysDiff <= 31 && sorted[i].weight - sorted[j].weight >= 3) {
          currentBadges.add('b_weight_loss_god');
          break;
        }
      }
    }
    const week1Metric = sorted.find(m => {
      const diff = (new Date(m.date).getTime() - new Date(firstMetric.date).getTime()) / (1000 * 3600 * 24);
      return diff >= 5 && diff <= 10;
    });
    if (week1Metric && firstMetric.weight - week1Metric.weight >= 1) currentBadges.add('b_7_golden_days');
    const maxFat = Math.max(...sorted.map(m => m.bodyFat));
    if (maxFat - latestMetric.bodyFat >= 3) currentBadges.add('b_fat_destroyer');
    if (sorted.length >= 10) currentBadges.add('b_dedicated');
    return Array.from(currentBadges);
  }, []);

  useEffect(() => {
    // Kiểm tra tình trạng Database khi App khởi chạy
    Database.checkHealth();

    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) { localStorage.removeItem('lucky_hub_user'); }
    }
    const remembered = localStorage.getItem('remembered_login');
    if (remembered) {
      try {
        const decoded = JSON.parse(atob(remembered));
        setLoginData(decoded);
        setRememberMe(true);
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
        const metrics = await Database.getMetrics(uid);
        setExistingMetrics(metrics || []);
        const updatedBadges = checkBadges(metrics || [], currentUser);
        const oldBadges = currentUser.badges || [];
        const newlyEarnedIds = updatedBadges.filter(id => !oldBadges.includes(id));
        if (newlyEarnedIds.length > 0) {
           const badgeInfo = BADGES_DB.find(b => b.id === newlyEarnedIds[0]);
           if (badgeInfo) setNewEarnedBadge(badgeInfo);
           const u = await Database.updateUser(uid, { badges: updatedBadges });
           if(u) { 
             setCurrentUser(u); 
             localStorage.setItem('lucky_hub_user', JSON.stringify(u)); 
           }
        } else if (JSON.stringify(updatedBadges) !== JSON.stringify(currentUser.badges)) {
           const u = await Database.updateUser(uid, { badges: updatedBadges });
           if(u) { 
             setCurrentUser(u); 
             localStorage.setItem('lucky_hub_user', JSON.stringify(u)); 
           }
        }
      }
    } catch (err) {}
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser, refreshTrigger]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: loginData.username.toLowerCase().trim(), 
          password: loginData.password 
        })
      });
      const result = await response.json();
      if (response.ok) {
        setCurrentUser(result);
        localStorage.setItem('lucky_hub_user', JSON.stringify(result));
        if (rememberMe) localStorage.setItem('remembered_login', btoa(JSON.stringify(loginData)));
        else localStorage.removeItem('remembered_login');
      } else if (response.status === 426) {
        setTempUpgradeData({ userId: result.userId, fullName: result.fullName });
        setUpgradePasswords({ ...upgradePasswords, oldPassword: loginData.password });
        setNeedsUpgrade(true);
      } else { alert(result.message || 'Sai thông tin'); }
    } catch (error) { alert('Lỗi kết nối Server'); } finally { setIsLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regData, username: regData.username.toLowerCase().trim() })
      });
      const result = await response.json();
      if (response.ok) {
        alert('Đăng ký thành công!');
        setIsRegistering(false);
        setLoginData({ username: regData.username, password: regData.password });
      } else alert(result.message || 'Lỗi đăng ký');
    } catch (error) { alert('Lỗi kết nối'); } finally { setIsLoading(false); }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className={`bg-white p-8 rounded-[2.5rem] shadow-2xl w-full ${isRegistering ? 'max-w-2xl' : 'max-w-md'} animate-in zoom-in-95 transition-all duration-300`}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-50 text-white text-3xl flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl animate-bounce-short">🍀</div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub</h1>
            <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-black">{isRegistering ? 'Gia nhập cộng đồng Lucky Hub' : 'Chuyên gia sức khỏe 2026'}</p>
          </div>
          {isRegistering ? (
            <form className="space-y-4" onSubmit={handleRegister}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Họ và tên</label><input required placeholder="Tên..." value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SĐT</label><input required placeholder="SĐT..." value={regData.phoneNumber} onChange={e => setRegData({...regData, phoneNumber: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">User</label><input required placeholder="User..." value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pass</label><div className="relative"><input required type={showRegPass ? "text" : "password"} placeholder="Pass..." value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm pr-12" /><button type="button" onClick={() => setShowRegPass(!showRegPass)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40">👁️</button></div></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giới tính</label><select value={regData.gender} onChange={e => setRegData({...regData, gender: e.target.value as any})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm"><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ngày sinh</label><input type="date" value={regData.birthDate} onChange={e => setRegData({...regData, birthDate: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chiều cao</label><input type="number" value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cân nặng</label><input type="number" value={regData.weight} onChange={e => setRegData({...regData, weight: Number(e.target.value)})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm" /></div>
                <div className="md:col-span-2 space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mục tiêu</label><select value={regData.healthGoal} onChange={e => setRegData({...regData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium text-sm">{Object.values(HealthGoal).map(goal => <option key={goal} value={goal}>{goal}</option>)}</select></div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest active:scale-95 mt-4">{isLoading ? '...' : 'Đăng ký'}</button>
              <div className="text-center mt-4"><button type="button" onClick={() => setIsRegistering(false)} className="text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors">Đã có tài khoản? Đăng nhập</button></div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Username</label><input required placeholder="User..." value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label><div className="relative"><input required type={showLoginPass ? "text" : "password"} placeholder="Pass..." value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium pr-12" /><button type="button" onClick={() => setShowLoginPass(!showLoginPass)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40">👁️</button></div></div>
              <div className="flex items-center gap-2 py-1"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded text-emerald-600" /><span className="text-xs font-bold text-slate-500">Ghi nhớ</span></div>
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest active:scale-95">{isLoading ? '...' : 'Đăng nhập'}</button>
              <div className="text-center mt-6"><button type="button" onClick={() => setIsRegistering(true)} className="text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors">Chưa có tài khoản? Đăng ký</button></div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser} users={users} onAddMetric={() => setIsAddingMetric(true)} refreshTrigger={refreshTrigger} />}
      {activeTab === 'community' && <NewsFeed currentUser={currentUser} />}
      {activeTab === 'metrics' && <MetricsManagement user={currentUser} users={users} onAddMetric={() => setIsAddingMetric(true)} refreshTrigger={refreshTrigger} />}
      {activeTab === 'profile' && <Profile user={currentUser} onNavigateToAdmin={() => setActiveTab('admin')} onUpdate={async (d) => { const uid = (currentUser as any).id || (currentUser as any)._id; const u = await Database.updateUser(uid, d); if(u) { setCurrentUser(u); localStorage.setItem('lucky_hub_user', JSON.stringify(u)); } }} />}
      {activeTab === 'admin' && currentUser.role === UserRole.ADMIN && <AdminPanel currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
      {isChatOpen && <ChatSystem currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onClose={() => setIsChatOpen(false)} />}
      {!isChatOpen && <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[1000] border-4 border-white">💬</button>}
      {isAddingMetric && <MetricForm onSave={async (m) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetric({ ...m, userId: uid }); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} onSaveBulk={async (l) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetricsBulk(l.map(m => ({...m, userId: uid}))); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} existingDates={existingMetrics.map(m => m.date)} onClose={() => setIsAddingMetric(false)} />}
      {newEarnedBadge && <BadgeCongratulation badge={newEarnedBadge} onClose={() => setNewEarnedBadge(null)} />}
    </Layout>
  );
};

export default App;
