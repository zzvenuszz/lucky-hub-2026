
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
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState(1); 
  
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [showForgotPass, setShowForgotPass] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [isAddingMetric, setIsAddingMetric] = useState(false);
  const [metricTargetUserId, setMetricTargetUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 
  const [existingMetrics, setExistingMetrics] = useState<HealthMetric[]>([]);
  
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [forgotData, setForgotData] = useState({ username: '', token: '', newPassword: '', confirmPassword: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [newEarnedBadge, setNewEarnedBadge] = useState<Badge | null>(null);

  const [regData, setRegData] = useState({
    username: '', email: '', password: '', fullName: '', phoneNumber: '',
    birthDate: '', height: 170, weight: 65,
    gender: 'Nam' as 'Nam'|'Nữ', healthGoal: HealthGoal.BODY_RECOMP
  });
  
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('lucky_hub_user');
    setActiveTab('dashboard');
    setIsChatOpen(false);
  }, []);

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const checkEmailExists = async (email: string) => {
    if (!email || !validateEmail(email)) {
      setEmailError(email ? 'Email không đúng định dạng' : 'Email là bắt buộc');
      return;
    }
    try {
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.exists) setEmailError('Email này đã được sử dụng');
      else setEmailError(null);
    } catch (e) {
      console.error('Lỗi check email');
    }
  };

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
    Database.checkHealth();
    const savedUser = localStorage.getItem('lucky_hub_user');
    if (savedUser) {
      try { setCurrentUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('lucky_hub_user'); }
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
      } else alert(result.message || 'Sai thông tin');
    } catch (error) { alert('Lỗi kết nối Server'); } finally { setIsLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return alert('Vui lòng sửa lỗi email trước khi đăng ký');
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

  const handleOpenMetricForm = (targetId?: string) => {
    const uid = (currentUser as any).id || (currentUser as any)._id;
    setMetricTargetUserId(targetId || uid);
    setIsAddingMetric(true);
  };

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
