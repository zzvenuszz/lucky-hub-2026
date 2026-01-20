
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import ChatSystem from './components/ChatSystem.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import MetricForm from './components/MetricForm.tsx';
import Profile from './components/Profile.tsx';
import { User, HealthGoal, UserRole, AccountStatus } from './types.ts';
import { Database } from './services/database.ts';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [isAddingMetric, setIsAddingMetric] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [regData, setRegData] = useState({
    username: '', 
    password: '', 
    fullName: '', 
    phoneNumber: '',
    birthDate: '', 
    height: 170, 
    weight: 65,
    gender: 'Nam' as 'Nam'|'Nữ', 
    healthGoal: HealthGoal.BODY_RECOMP
  });

  // Khôi phục trạng thái đăng nhập từ localStorage khi app khởi chạy
  useEffect(() => {
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setCurrentUser(parsedUser);
      } catch (e) {
        localStorage.removeItem('lucky_hub_user');
      }
    }
  }, []);

  const fetchData = async () => {
    try {
      const [u, k] = await Promise.all([Database.getUsers(), Database.getKnowledge()]);
      setUsers(u || []);
      setKnowledge(k || []);
    } catch (err) {
      console.error("Fetch data error:", err);
    }
  };

  useEffect(() => { 
    if (currentUser) {
      fetchData(); 
    }
  }, [currentUser]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      if (response.ok) {
        const user = await response.json();
        setCurrentUser(user);
        // Lưu vào localStorage để không bị mất khi reload
        localStorage.setItem('lucky_hub_user', JSON.stringify(user));
      } else {
        // Fallback cho preview nếu API thất bại
        if (loginData.username === 'admin' && loginData.password === 'admin') {
          const mockAdmin: User = { 
            id: 'admin', username: 'admin', fullName: 'Admin (Preview)', 
            role: UserRole.ADMIN, status: AccountStatus.ACTIVE, gender: 'Nam', 
            healthGoal: HealthGoal.STRENGTHEN_HEALTH, phoneNumber: '000', birthDate: '', height: 170, weight: 70 
          };
          setCurrentUser(mockAdmin);
          localStorage.setItem('lucky_hub_user', JSON.stringify(mockAdmin));
          alert('Chế độ Preview: Đăng nhập với quyền Admin mặc định.');
        } else {
          alert('Sai thông tin đăng nhập hoặc server không phản hồi.');
        }
      }
    } catch (error) {
      alert('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regData)
      });
      
      if (res.ok) {
        alert('Đăng ký thành công! Hãy đăng nhập.');
        setIsRegistering(false);
      } else {
        // Mock fallback cho preview
        localStorage.setItem('mock_preview_user', JSON.stringify({ ...regData, id: 'mock_' + Date.now() }));
        alert('Chế độ Preview: Đã lưu thông tin đăng ký vào bộ nhớ trình duyệt.');
        setIsRegistering(false);
      }
    } catch (error) {
      alert('Lỗi kết nối server trong chế độ Preview.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMetric = async (metric: any) => {
    if (!currentUser) return;
    const uid = (currentUser as any).id || (currentUser as any)._id;
    await Database.saveMetric({ ...metric, userId: uid });
    fetchData();
    setIsAddingMetric(false);
  };

  if (!currentUser) {
    const previewAvatar = regData.gender === 'Nữ' 
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;

    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md transition-all duration-300">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 text-white text-3xl font-bold flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl shadow-emerald-200 overflow-hidden">
              {isRegistering ? <img src={previewAvatar} className="w-full h-full object-cover" /> : 'L'}
            </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Lucky Hub</h1>
            <p className="text-slate-400 text-sm mt-1 font-medium">Hệ thống quản lý sức khỏe thông minh</p>
          </div>

          {!isRegistering ? (
            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">TÊN ĐĂNG NHẬP</label>
                <input required placeholder="Nhập tên đăng nhập" value={loginData.username} onChange={e => setLoginData({...loginData, username: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent outline-none focus:border-emerald-500 focus:bg-white transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">MẬT KHẨU</label>
                <input required type="password" placeholder="••••••••" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-transparent outline-none focus:border-emerald-500 focus:bg-white transition-all" />
              </div>
              <button type="submit" disabled={isLoading} className={`w-full bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 active:scale-95 transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-700'}`}>
                {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
              </button>
              <button type="button" onClick={() => setIsRegistering(true)} className="w-full text-emerald-600 text-sm font-bold hover:underline">Chưa có tài khoản? Đăng ký</button>
              <p className="text-[10px] text-center text-slate-300 mt-2 italic">Mẹo: Nhập admin/admin nếu server chưa phản hồi</p>
            </form>
          ) : (
            <form className="space-y-3 max-h-[60vh] overflow-y-auto px-1" onSubmit={handleRegister}>
              <input placeholder="Họ và tên" required value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <input placeholder="Số điện thoại" required type="tel" value={regData.phoneNumber} onChange={e => setRegData({...regData, phoneNumber: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <input placeholder="Tên đăng nhập" required value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <input placeholder="Mật khẩu" type="password" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1">CHIỀU CAO (CM)</label>
                  <input placeholder="Chiều cao" type="number" required value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1">CÂN NẶNG (KG)</label>
                  <input placeholder="Cân nặng" type="number" step="0.1" required value={regData.weight} onChange={e => setRegData({...regData, weight: Number(e.target.value)})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1">GIỚI TÍNH</label>
                  <select value={regData.gender} onChange={e => setRegData({...regData, gender: e.target.value as any})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none">
                    <option value="Nam">Nam</option><option value="Nữ">Nữ</option>
                  </select>
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1">NGÀY SINH</label>
                  <input type="date" required value={regData.birthDate} onChange={e => setRegData({...regData, birthDate: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 ml-1">MỤC TIÊU SỨC KHỎE</label>
                <select value={regData.healthGoal} onChange={e => setRegData({...regData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none">
                  {Object.values(HealthGoal).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <button type="submit" disabled={isLoading} className={`w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all mt-4 ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-700'}`}>
                {isLoading ? 'Đang đăng ký...' : 'Đăng ký ngay'}
              </button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-slate-400 text-sm hover:text-slate-600 pb-2">Quay lại đăng nhập</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser} users={users} onAddMetric={() => setIsAddingMetric(true)} />}
      {activeTab === 'chat' && <ChatSystem currentUser={currentUser} users={users} knowledge={knowledge} />}
      {activeTab === 'profile' && <Profile user={currentUser} onUpdate={async (d) => { 
        const uid = (currentUser as any).id || (currentUser as any)._id;
        const u = await Database.updateUser(uid, d); 
        if(u) {
          setCurrentUser(u);
          localStorage.setItem('lucky_hub_user', JSON.stringify(u));
        }
      }} />}
      {activeTab === 'admin' && (currentUser as any).role === 'ADMIN' && <AdminPanel users={users} knowledge={knowledge} onRefresh={fetchData} />}
      
      {isAddingMetric && <MetricForm onSave={handleSaveMetric} onSaveBulk={async (list) => { 
        const uid = (currentUser as any).id || (currentUser as any)._id;
        await Database.saveMetricsBulk(list.map(m => ({...m, userId: uid}))); 
        fetchData(); 
        setIsAddingMetric(false); 
      }} onClose={() => setIsAddingMetric(false)} />}
    </Layout>
  );
};

export default App;
