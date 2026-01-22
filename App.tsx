
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
    const consoleEl = document.getElementById('debug-console');
    if (consoleEl) {
      consoleEl.style.display = (currentUser?.role === UserRole.ADMIN) ? 'block' : 'none';
      if (currentUser?.role === UserRole.ADMIN && window.debugLog) {
        logApp(`Quản trị viên ${currentUser.fullName} đã đăng nhập.`, 'success');
      }
    }
  }, [currentUser]);

  useEffect(() => {
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
        logApp(`Khôi phục phiên làm việc cho: ${parsedUser.fullName}`);
      } catch (e) {
        localStorage.removeItem('lucky_hub_user');
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      logApp("Đang tải dữ liệu hệ thống...");
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
      logApp("Dữ liệu đã được cập nhật.", "success");
    } catch (err) { logApp("Lỗi tải dữ liệu cơ sở.", "error"); }
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser, refreshTrigger]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    logApp(`Đang xác thực người dùng: ${loginData.username}...`);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });
      if (response.ok) {
        const user = await response.json();
        setCurrentUser(user);
        localStorage.setItem('lucky_hub_user', JSON.stringify(user));
        logApp(`Đăng nhập thành công: ${user.fullName}`, "success");
      } else if (response.status === 426) {
        const data = await response.json();
        setTempUpgradeData({ userId: data.userId, fullName: data.fullName });
        setUpgradePasswords({ ...upgradePasswords, oldPassword: loginData.password });
        setNeedsUpgrade(true);
        logApp("Yêu cầu nâng cấp bảo mật mật khẩu.", "info");
      } else {
        const error = await response.json();
        alert(error.message || 'Sai thông tin đăng nhập.');
        logApp(`Đăng nhập thất bại cho ${loginData.username}: ${error.message}`, "error");
      }
    } catch (error) { 
      alert('Lỗi kết nối.'); 
      logApp("Lỗi kết nối Server khi đăng nhập.", "error");
    } finally { setIsLoading(false); }
  };

  /**
   * PHÂN TÍCH: Hàm này xử lý việc nâng cấp mật khẩu từ plain-text sang dạng băm (SHA256).
   * Được gọi khi hệ thống yêu cầu nâng cấp bảo mật (mã lỗi 426 khi đăng nhập).
   */
  const handleUpgradePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (upgradePasswords.newPassword !== upgradePasswords.confirmPassword) {
      alert('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (!tempUpgradeData) return;
    
    setIsLoading(true);
    logApp(`Đang nâng cấp bảo mật cho ${tempUpgradeData.fullName}...`);
    try {
      // Sử dụng Database service để cập nhật thông tin người dùng
      const user = await Database.updateUser(tempUpgradeData.userId, {
        password: upgradePasswords.newPassword,
        isPasswordEncrypted: true
      });
      
      if (user) {
        alert('Nâng cấp mật khẩu thành công! Hãy đăng nhập lại bằng mật khẩu mới.');
        setNeedsUpgrade(false);
        setLoginData({ ...loginData, password: '' });
        logApp("Nâng cấp mật khẩu thành công.", "success");
      }
    } catch (error) {
      alert('Lỗi kết nối hệ thống.');
      logApp("Lỗi hệ thống khi nâng cấp mật khẩu.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logApp(`Người dùng ${currentUser?.fullName} đã đăng xuất.`);
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    logApp(`Đang đăng ký tài khoản mới: ${regData.username}...`);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      });
      if (res.ok) { 
        alert('Thành công! Hãy đăng nhập.'); 
        setIsRegistering(false); 
        logApp("Đăng ký thành viên mới thành công.", "success");
      }
      else { 
        const err = await res.json(); 
        alert(err.message || 'Lỗi đăng ký.'); 
        logApp(`Đăng ký thất bại: ${err.message}`, "error");
      }
    } catch (error) { logApp("Lỗi hệ thống khi đăng ký.", "error"); } finally { setIsLoading(false); }
  };

  const handleSaveMetric = async (metric: any) => {
    if (!currentUser) return;
    const uid = (currentUser as any).id || (currentUser as any)._id;
    logApp(`Đang lưu chỉ số mới cho ngày ${metric.date}...`);
    
    const exists = existingMetrics.find(m => m.date === metric.date);
    if (exists) {
      if (!confirm(`Dữ liệu ngày ${metric.date} đã tồn tại. Bạn có thực sự muốn ghi đè chỉ số cũ không?`)) {
        logApp("Hủy lưu do trùng ngày đo.");
        return;
      }
      await Database.deleteMetricsByDates(uid, [metric.date]);
      logApp("Đã xóa dữ liệu cũ để ghi đè.");
    }

    await Database.saveMetric({ ...metric, userId: uid });
    setRefreshTrigger(prev => prev + 1); 
    setIsAddingMetric(false);
    logApp(`Lưu chỉ số ngày ${metric.date} thành công.`, "success");
  };

  const handleSaveBulk = async (list: any[]) => {
    if (!currentUser) return;
    const uid = (currentUser as any).id || (currentUser as any)._id;
    logApp(`Đang lưu hàng loạt ${list.length} chỉ số...`);
    
    const newDates = list.map(m => m.date);
    const duplicates = existingMetrics.filter(m => newDates.includes(m.date));
    
    if (duplicates.length > 0) {
      if (!confirm(`Tìm thấy ${duplicates.length} ngày đã có dữ liệu. Bạn có muốn GHI ĐÈ không?`)) {
        logApp("Hủy lưu hàng loạt do có ngày trùng.");
        return;
      }
      await Database.deleteMetricsByDates(uid, duplicates.map(m => m.date));
    }

    await Database.saveMetricsBulk(list.map(m => ({...m, userId: uid})));
    setRefreshTrigger(prev => prev + 1); 
    setIsAddingMetric(false);
    logApp(`Đã lưu thành công ${list.length} chỉ số từ sổ tay.`, 'success');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 text-white text-3xl font-bold flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl shadow-emerald-200">
              {needsUpgrade ? '🔒' : isRegistering ? '👤' : 'L'}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Lucky Hub</h1>
            <p className="text-slate-400 text-sm mt-1">Health Management Platform</p>
          </div>
          {needsUpgrade ? (
            <form className="space-y-4" onSubmit={handleUpgradePassword}>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-4 text-xs text-amber-700 font-medium text-center">Chào <b>{tempUpgradeData?.fullName}</b>, hãy đặt mật khẩu mới.</div>
              <input required type="password" placeholder="Mật khẩu hiện tại" value={upgradePasswords.oldPassword} onChange={e => setUpgradePasswords({...upgradePasswords, oldPassword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border outline-none" />
              <input required type="password" placeholder="Mật khẩu mới" value={upgradePasswords.newPassword} onChange={e => setUpgradePasswords({...upgradePasswords, newPassword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border outline-none" />
              <input required type="password" placeholder="Xác nhận mật khẩu mới" value={upgradePasswords.confirmPassword} onChange={e => setUpgradePasswords({...upgradePasswords, confirmPassword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border outline-none" />
              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg">Cập nhật mật khẩu</button>
            </form>
          ) : !isRegistering ? (
            <form className="space-y-4" onSubmit={handleLogin}>
              <input required placeholder="Tên đăng nhập" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent outline-none focus:border-emerald-500" />
              <input required type="password" placeholder="Mật khẩu" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent outline-none focus:border-emerald-500" />
              <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg">Đăng nhập</button>
              <button type="button" onClick={() => setIsRegistering(true)} className="w-full text-emerald-600 text-sm font-bold hover:underline">Chưa có tài khoản? Đăng ký</button>
            </form>
          ) : (
            <form className="space-y-3 max-h-[60vh] overflow-y-auto px-1" onSubmit={handleRegister}>
              <input placeholder="Họ và tên" required value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none" />
              <input placeholder="Tên đăng nhập" required value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none" />
              <input placeholder="Mật khẩu" type="password" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border outline-none" />
              <div className="flex gap-2">
                <input type="number" placeholder="Chiều cao" required value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-slate-50 outline-none" />
                <input type="number" placeholder="Cân nặng" required value={regData.weight} onChange={e => setRegData({...regData, weight: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-slate-50 outline-none" />
              </div>
              <select value={regData.healthGoal} onChange={e => setRegData({...regData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 outline-none">
                {Object.values(HealthGoal).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl mt-4">Đăng ký</button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-slate-400 text-sm pb-2">Quay lại</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && (
        <Dashboard 
          user={currentUser} 
          users={users} 
          onAddMetric={() => setIsAddingMetric(true)} 
          refreshTrigger={refreshTrigger} 
        />
      )}
      {activeTab === 'profile' && (
        <Profile 
          user={currentUser} onNavigateToAdmin={() => setActiveTab('admin')}
          onUpdate={async (d) => { 
            const uid = (currentUser as any).id || (currentUser as any)._id;
            const u = await Database.updateUser(uid, d); 
            if(u) { setCurrentUser(u); localStorage.setItem('lucky_hub_user', JSON.stringify(u)); }
          }} 
        />
      )}
      {activeTab === 'admin' && currentUser.role === UserRole.ADMIN && <AdminPanel currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onRefresh={fetchData} />}
      
      {isChatOpen && <ChatSystem currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} onClose={() => setIsChatOpen(false)} />}
      
      {!isChatOpen && (
        <button 
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 left-6 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-[1000] border-4 border-white group"
        >
          <span className="text-2xl group-hover:rotate-12 transition-transform">💬</span>
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
        </button>
      )}

      {isAddingMetric && (
        <MetricForm 
          onSave={handleSaveMetric} 
          onSaveBulk={handleSaveBulk} 
          existingDates={existingMetrics.map(m => m.date)}
          onClose={() => setIsAddingMetric(false)} 
        />
      )}
    </Layout>
  );
};

export default App;
