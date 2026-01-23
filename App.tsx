
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
  
  // State cho thông báo danh hiệu mới
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

  // LOGIC TỰ ĐỘNG GÁN DANH HIỆU
  const checkBadges = useCallback((metrics: HealthMetric[], user: User): string[] => {
    const currentBadges = new Set(user.badges || []);
    if (metrics.length === 0) return Array.from(currentBadges);

    const sorted = [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(a.date).getTime());
    const firstMetric = sorted[0];
    const latestMetric = sorted[sorted.length - 1];

    // 1. Chiến thần diệt mỡ (3kg/30 ngày)
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

    // 2. 7 ngày vàng (1kg/7 ngày đầu)
    const week1Metric = sorted.find(m => {
      const diff = (new Date(m.date).getTime() - new Date(firstMetric.date).getTime()) / (1000 * 3600 * 24);
      return diff >= 5 && diff <= 10;
    });
    if (week1Metric && firstMetric.weight - week1Metric.weight >= 1) {
      currentBadges.add('b_7_golden_days');
    }

    // 3. Đánh tan mỡ thừa (Giảm 3% mỡ)
    const maxFat = Math.max(...sorted.map(m => m.bodyFat));
    if (maxFat - latestMetric.bodyFat >= 3) {
      currentBadges.add('b_fat_destroyer');
    }

    // 4. Chuyên cần (Có ít nhất 10 bản ghi)
    if (sorted.length >= 10) {
      currentBadges.add('b_dedicated');
    }

    return Array.from(currentBadges);
  }, []);

  useEffect(() => {
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

        // Logic phát hiện danh hiệu mới
        const updatedBadges = checkBadges(metrics || [], currentUser);
        const oldBadges = currentUser.badges || [];
        
        // Tìm các danh hiệu có trong updated nhưng chưa có trong old
        const newlyEarnedIds = updatedBadges.filter(id => !oldBadges.includes(id));

        if (newlyEarnedIds.length > 0) {
           // Lấy thông tin chi tiết danh hiệu đầu tiên vừa đạt được để chúc mừng
           const badgeInfo = BADGES_DB.find(b => b.id === newlyEarnedIds[0]);
           if (badgeInfo) {
             setNewEarnedBadge(badgeInfo);
           }
           
           // Lưu vào DB ngay lập tức
           const u = await Database.updateUser(uid, { badges: updatedBadges });
           if(u) { 
             setCurrentUser(u); 
             localStorage.setItem('lucky_hub_user', JSON.stringify(u)); 
           }
        } else if (JSON.stringify(updatedBadges) !== JSON.stringify(currentUser.badges)) {
           // Trường hợp cập nhật khác (ví dụ admin xóa badge)
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
    } catch (error) { alert('Lỗi kết nối'); } finally { setIsLoading(false); }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-50 text-white text-3xl flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl animate-bounce-short">🍀</div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub</h1>
            <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-black">Chuyên gia sức khỏe 2026</p>
          </div>
          
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên đăng nhập</label>
              <input required placeholder="Nhập tên đăng nhập..." value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
              <div className="relative">
                <input required type={showLoginPass ? "text" : "password"} placeholder="Nhập mật khẩu..." value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none font-medium pr-12" />
                <button type="button" onClick={() => setShowLoginPass(!showLoginPass)} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100">{showLoginPass ? '👁️' : '🙈'}</button>
              </div>
            </div>
            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-xs font-bold text-slate-500">Ghi nhớ đăng nhập</span>
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest active:scale-95">{isLoading ? '...' : 'Đăng nhập'}</button>
          </form>
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
      {!isChatOpen && (
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[1000] border-4 border-white">💬</button>
      )}
      {isAddingMetric && <MetricForm onSave={async (m) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetric({ ...m, userId: uid }); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} onSaveBulk={async (l) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetricsBulk(l.map(m => ({...m, userId: uid}))); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} existingDates={existingMetrics.map(m => m.date)} onClose={() => setIsAddingMetric(false)} />}
      
      {/* Modal Chúc mừng danh hiệu */}
      {newEarnedBadge && (
        <BadgeCongratulation 
          badge={newEarnedBadge} 
          onClose={() => setNewEarnedBadge(null)} 
        />
      )}
    </Layout>
  );
};

export default App;
