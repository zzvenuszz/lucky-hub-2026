
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout.tsx';
import Dashboard from './components/Dashboard.tsx';
import ChatSystem from './components/ChatSystem.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import MetricForm from './components/MetricForm.tsx';
import Profile from './components/Profile.tsx';
import { User, HealthGoal } from './types.ts';
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
    username: '', password: '', fullName: '', birthDate: '', height: 170, gender: 'Nam' as 'Nam'|'Nữ', healthGoal: HealthGoal.BODY_RECOMP
  });

  const fetchData = async () => {
    const [u, k] = await Promise.all([Database.getUsers(), Database.getKnowledge()]);
    setUsers(u || []);
    setKnowledge(k || []);
  };

  useEffect(() => { fetchData(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      const data = await res.json();

      if (res.ok) {
        setCurrentUser(data);
      } else {
        alert(data.message || 'Sai thông tin đăng nhập hoặc tài khoản đã bị khóa.');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Không thể kết nối đến máy chủ.');
    } finally {
      setIsLoading(false);
    }
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
        const data = await res.json();
        alert(data.message || 'Lỗi xảy ra khi đăng ký.');
      }
    } catch (error) {
      alert('Lỗi kết nối khi đăng ký.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMetric = async (metric: any) => {
    if (!currentUser) return;
    await Database.saveMetric({ ...metric, userId: (currentUser as any).id || (currentUser as any)._id });
    fetchData();
    setIsAddingMetric(false);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-emerald-600 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md transition-all duration-300">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 text-white text-3xl font-bold flex items-center justify-center rounded-2xl mx-auto mb-4 shadow-xl shadow-emerald-200">L</div>
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
            </form>
          ) : (
            <form className="space-y-3" onSubmit={handleRegister}>
              <input placeholder="Họ tên" required value={regData.fullName} onChange={e => setRegData({...regData, fullName: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <input placeholder="Tên đăng nhập" required value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <input placeholder="Mật khẩu" type="password" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
              <div className="flex gap-2">
                <input placeholder="Chiều cao (cm)" type="number" required value={regData.height} onChange={e => setRegData({...regData, height: Number(e.target.value)})} className="flex-1 px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none" />
                <select value={regData.gender} onChange={e => setRegData({...regData, gender: e.target.value as any})} className="flex-1 px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none">
                  <option value="Nam">Nam</option><option value="Nữ">Nữ</option>
                </select>
              </div>
              <select value={regData.healthGoal} onChange={e => setRegData({...regData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-transparent focus:border-emerald-500 outline-none">
                {Object.values(HealthGoal).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button type="submit" disabled={isLoading} className={`w-full bg-emerald-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-emerald-700'}`}>
                {isLoading ? 'Đang đăng ký...' : 'Đăng ký ngay'}
              </button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-slate-400 text-sm hover:text-slate-600">Quay lại đăng nhập</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={() => setCurrentUser(null)} activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard user={currentUser} users={users} onAddMetric={() => setIsAddingMetric(true)} />}
      {activeTab === 'chat' && <ChatSystem currentUser={currentUser} users={users} knowledge={knowledge} />}
      {activeTab === 'profile' && <Profile user={currentUser} onUpdate={async (d) => { const u = await Database.updateUser((currentUser as any).id || (currentUser as any)._id, d); if(u) setCurrentUser(u); }} />}
      {activeTab === 'admin' && (currentUser as any).role === 'ADMIN' && <AdminPanel users={users} knowledge={knowledge} onRefresh={fetchData} />}
      
      {isAddingMetric && <MetricForm onSave={handleSaveMetric} onSaveBulk={async (list) => { await Database.saveMetricsBulk(list.map(m => ({...m, userId: (currentUser as any).id || (currentUser as any)._id}))); fetchData(); setIsAddingMetric(false); }} onClose={() => setIsAddingMetric(false)} />}
    </Layout>
  );
};

export default App;
