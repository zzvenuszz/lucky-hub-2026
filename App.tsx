
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import ChatSystem from './components/ChatSystem.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import MetricForm from './components/MetricForm.tsx';
import Profile from './components/Profile.tsx';
import { User, HealthGoal, UserRole, AccountStatus, AIRule, HealthMetric } from './types.ts';
import { Database } from './services/database.ts';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState(false); 
  const [tempUpgradeData, setTempUpgradeData] = useState<{userId: string, fullName: string} | null>(null);
  const [upgradePasswords, setUpgradePasswords] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  
  // Visibility toggles for passwords
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
  const [regData, setRegData] = useState({
    username: '', password: '', fullName: '', phoneNumber: '',
    birthDate: '', height: 170, weight: 65,
    gender: 'Nam' as 'Nam'|'Nữ', healthGoal: HealthGoal.BODY_RECOMP
  });

  const logApp = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (window.debugLog) window.debugLog(`[Ứng dụng] ${msg}`, type);
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (e) { localStorage.removeItem('lucky_hub_user'); }
    }
  }, []);

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
      }
    } catch (err) { logApp("Lỗi tải dữ liệu.", "error"); }
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser, refreshTrigger]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    
    const requestData = { 
      username: loginData.username.toLowerCase().trim(), 
      password: loginData.password 
    };

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setCurrentUser(result);
        localStorage.setItem('lucky_hub_user', JSON.stringify(result));
        logApp(`Đăng nhập thành công: ${result.fullName}`, "success");
      } else if (response.status === 426) {
        setTempUpgradeData({ userId: result.userId, fullName: result.fullName });
        setUpgradePasswords({ ...upgradePasswords, oldPassword: loginData.password });
        setNeedsUpgrade(true);
      } else {
        alert(result.message || 'Sai thông tin đăng nhập.');
        logApp(result.message || 'Đăng nhập thất bại.', 'error');
      }
    } catch (error) { 
      alert('Lỗi kết nối Server. Vui lòng kiểm tra internet.'); 
    } finally { setIsLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);

    const requestData = { 
      ...regData, 
      username: regData.username.toLowerCase().trim() 
    };

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      const result = await res.json();
      if (res.ok) { 
        alert('🎉 CHÚC MỪNG! Bạn đã đăng ký thành công.\n\nHãy đăng nhập bằng tài khoản vừa tạo để bắt đầu hành trình sức khỏe.'); 
        setLoginData({ username: regData.username, password: regData.password });
        setIsRegistering(false); 
      } else { 
        alert(result.message || 'Lỗi đăng ký. Vui lòng thử tên đăng nhập khác.'); 
      }
    } catch (error) { alert('Lỗi kết nối Server.'); } finally { setIsLoading(false); }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in zoom-in-95">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 text-white text-3xl font-bold flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl">
              {needsUpgrade ? '🔒' : isRegistering ? '👤' : 'L'}
            </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub</h1>
            <p className="text-slate-400 text-sm mt-1">Nền tảng Quản lý Sức khỏe 2026</p>
          </div>
          
          {needsUpgrade ? (
            <form className="space-y-4" onSubmit={async (e) => {
              e.preventDefault();
              if (upgradePasswords.newPassword !== upgradePasswords.confirmPassword) return alert('Mật khẩu xác nhận không khớp');
              const user = await Database.updateUser(tempUpgradeData!.userId, { password: upgradePasswords.newPassword, isPasswordEncrypted: true });
              if (user) { alert('Cập nhật mật khẩu thành công! Hãy đăng nhập lại.'); setNeedsUpgrade(false); setLoginData({ ...loginData, password: '' }); }
            }}>
              <div className="relative">
                <input required type={showUpgradePass ? "text" : "password"} placeholder="Mật khẩu mới" value={upgradePasswords.newPassword} onChange={e => setUpgradePasswords({...upgradePasswords, newPassword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border outline-none focus:ring-2 focus:ring-emerald-500 pr-12" />
                <button type="button" onClick={() => setShowUpgradePass(!showUpgradePass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xl grayscale opacity-50 hover:opacity-100">{showUpgradePass ? '👁️' : '🙈'}</button>
              </div>
              <input required type={showUpgradePass ? "text" : "password"} placeholder="Xác nhận mật khẩu" value={upgradePasswords.confirmPassword} onChange={e => setUpgradePasswords({...upgradePasswords, confirmPassword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border outline-none focus:ring-2 focus:ring-emerald-500" />
              <button type="submit" className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest">Cập nhật bảo mật</button>
            </form>
          ) : !isRegistering ? (
            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tên đăng nhập</label>
                <input required placeholder="Username..." inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck="false" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
                <div className="relative">
                  <input required type={showLoginPass ? "text" : "password"} placeholder="********" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none transition-all font-medium pr-12" />
                  <button type="button" onClick={() => setShowLoginPass(!showLoginPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xl grayscale opacity-50 hover:opacity-100">{showLoginPass ? '👁️' : '🙈'}</button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all uppercase tracking-widest active:scale-95">
                {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
              </button>
              <button type="button" onClick={() => setIsRegistering(true)} className="w-full text-emerald-600 text-sm font-bold hover:underline">Chưa có tài khoản? Đăng ký ngay</button>
            </form>
          ) : (
            <form className="space-y-3 max-h-[70vh] overflow-y-auto px-1 no-scrollbar" onSubmit={handleRegister}>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ và tên</label>
                  <input placeholder="Họ và tên..." required value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên đăng nhập (Username)</label>
                  <input placeholder="Username..." inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck="false" required value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none focus:border-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mật khẩu</label>
                  <div className="relative">
                    <input placeholder="Mật khẩu..." type={showRegPass ? "text" : "password"} required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none focus:border-emerald-500 pr-12" />
                    <button type="button" onClick={() => setShowRegPass(!showRegPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-xl grayscale opacity-50 hover:opacity-100">{showRegPass ? '👁️' : '🙈'}</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cao (cm)</label>
                    <input type="number" required value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 outline-none" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nặng (kg)</label>
                    <input type="number" required value={regData.weight} onChange={e => setRegData({...regData, weight: Number(e.target.value)})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 outline-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày sinh</label>
                  <input type="date" required value={regData.birthDate} onChange={e => setRegData({...regData, birthDate: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mục tiêu sức khỏe</label>
                  <select value={regData.healthGoal} onChange={e => setRegData({...regData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 outline-none font-medium text-sm">
                    {Object.values(HealthGoal).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl mt-4 shadow-lg uppercase tracking-widest active:scale-95">
                {isLoading ? 'Đang đăng ký...' : 'Đăng ký tài khoản'}
              </button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-slate-400 text-sm pb-4 font-medium hover:text-emerald-600 transition-colors">Đã có tài khoản? Quay lại đăng nhập</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser} users={users} onAddMetric={() => setIsAddingMetric(true)} refreshTrigger={refreshTrigger} />}
      {activeTab === 'profile' && <Profile user={currentUser} onNavigateToAdmin={() => setActiveTab('admin')} onUpdate={async (d) => { const uid = (currentUser as any).id || (currentUser as any)._id; const u = await Database.updateUser(uid, d); if(u) { setCurrentUser(u); localStorage.setItem('lucky_hub_user', JSON.stringify(u)); } }} />}
      {activeTab === 'admin' && currentUser.role === UserRole.ADMIN && <AdminPanel currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
      {isChatOpen && <ChatSystem currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onClose={() => setIsChatOpen(false)} />}
      {!isChatOpen && (
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 left-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[1000] border-4 border-white group">
          <span className="text-2xl group-hover:rotate-12 transition-transform">💬</span>
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
        </button>
      )}
      {isAddingMetric && <MetricForm onSave={async (m) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetric({ ...m, userId: uid }); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} onSaveBulk={async (l) => { const uid = (currentUser as any).id || (currentUser as any)._id; await Database.saveMetricsBulk(l.map(m => ({...m, userId: uid}))); setRefreshTrigger(t => t+1); setIsAddingMetric(false); }} existingDates={existingMetrics.map(m => m.date)} onClose={() => setIsAddingMetric(false)} />}
    </Layout>
  );
};

export default App;
