
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthGoal, HealthMetric } from '../types.ts';
import { Database } from '../services/database.ts';
import { getAICoachResponse } from '../services/gemini.ts';

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  // AI Sandbox States
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [testImage, setTestImage] = useState<string | null>(null);
  const [adminMetrics, setAdminMetrics] = useState<HealthMetric[]>([]);
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [sandboxLogs, setSandboxLogs] = useState<{msg: string, type: string, time: string}[]>([]);
  
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalLog = (e: any) => {
      if (activeTab === 'ai') addSandboxLog(e.detail.msg, e.detail.type);
    };
    window.addEventListener('ai-sandbox-log', handleGlobalLog);
    return () => window.removeEventListener('ai-sandbox-log', handleGlobalLog);
  }, [activeTab]);

  // Tải chỉ số của Admin để phục vụ test
  useEffect(() => {
    if (activeTab === 'ai') {
      const uid = (currentUser as any).id || (currentUser as any)._id;
      Database.getMetrics(uid).then(m => {
        setAdminMetrics(m || []);
        addSandboxLog(`Đã kết nối dữ liệu Admin: ${currentUser.fullName}`, 'success');
      });
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [testMessages, isTestTyping]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxLogs]);

  const addSandboxLog = (msg: string, type: string = 'info') => {
    setSandboxLogs(prev => [...prev.slice(-49), { 
      msg, type, time: new Date().toLocaleTimeString([], { hour12: false })
    }]);
  };

  const handleTestChat = async () => {
    if (!testInput.trim() && !testImage) return;
    
    // Lấy chỉ số mới nhất của Admin
    const latestMetric = [...adminMetrics].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    addSandboxLog(`[Test] Đang dùng chỉ số thực của Admin: ${currentUser.fullName} (${currentUser.healthGoal})`, 'user');
    
    const base64Data = testImage ? testImage.split(',')[1] : undefined;
    const currentTestImage = testImage;

    const userMsg: Message = {
      id: `test_${Date.now()}`,
      senderId: 'admin_test',
      senderName: currentUser.fullName,
      senderRole: UserRole.ADMIN,
      content: testInput || (currentTestImage ? "[Gửi ảnh kiểm thử]" : ""),
      imageUrl: currentTestImage || undefined,
      timestamp: new Date().toISOString()
    };
    
    setTestMessages(prev => [...prev, userMsg]);
    const sentInput = testInput;
    setTestInput('');
    setTestImage(null);
    setIsTestTyping(true);
    
    try {
      const aiResponse = await getAICoachResponse(
        [...testMessages, userMsg], 
        knowledge, 
        rules, 
        sentInput || "Phân tích dữ liệu thực tế của tôi",
        currentUser.healthGoal,
        latestMetric,
        base64Data
      );
      
      if (aiResponse) {
        setTestMessages(prev => [...prev, {
          id: `ai_${Date.now()}`,
          senderId: 'ai_coach',
          senderName: 'Lucky AI',
          senderRole: 'AI' as any,
          content: aiResponse,
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (err: any) {
      addSandboxLog(`Lỗi Sandbox: ${err.message}`, "error");
    } finally {
      setIsTestTyping(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    if (confirm('Xác nhận reset mật khẩu?')) {
      const res = await Database.resetPassword(id);
      if (res) alert(`Mật khẩu mới: ${res.newPassword}`);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === AccountStatus.ACTIVE ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    await Database.updateUser(user.id, { status: nextStatus });
    onRefresh();
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    await Database.updateUser(id, { role });
    onRefresh();
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100">
        <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
      </div>

      <div className="px-8 pb-8">
        {activeTab === 'users' ? (
          <>
            <div className="mb-6">
              <input placeholder="Tìm kiếm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm transition-all shadow-inner" />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-50">
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Thông tin</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Vai trò</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Trạng thái</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.filter(u => u.fullName.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                    <tr key={u.id} className="group hover:bg-slate-50/30 transition-colors">
                      <td className="py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                          <div><div className="font-bold text-slate-800">{u.fullName}</div><div className="text-[10px] text-slate-400">@{u.username}</div></div>
                        </div>
                      </td>
                      <td>
                        <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)} className="text-[10px] font-black bg-slate-100 border-none rounded-lg px-2 py-1">
                          <option value={UserRole.MEMBER}>MEMBER</option>
                          <option value={UserRole.COACH}>COACH</option>
                          <option value={UserRole.ADMIN}>ADMIN</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => handleToggleStatus(u)} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status}</button>
                      </td>
                      <td className="text-right"><button onClick={() => handleResetPassword(u.id)} className="text-[10px] font-bold text-emerald-600">Reset</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4">⚖️ Quy chuẩn AI</h3>
                <form onSubmit={e => { e.preventDefault(); Database.addRule({content: newRule}).then(() => {setNewRule(''); onRefresh();}); }} className="flex gap-2 mb-4">
                  <input placeholder="Quy tắc..." value={newRule} onChange={e => setNewRule(e.target.value)} className="flex-grow px-4 py-2 bg-white rounded-xl text-xs outline-none shadow-inner" />
                  <button type="submit" className="bg-emerald-600 text-white px-3 rounded-xl">+</button>
                </form>
                <div className="space-y-2 max-h-[140px] overflow-y-auto no-scrollbar">
                  {rules.map(r => <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded-xl text-[10px] border border-slate-100"><span>"{r.content}"</span><button onClick={() => Database.deleteRule(r.id).then(onRefresh)} className="text-red-300">×</button></div>)}
                </div>
              </div>
              <div className="bg-emerald-50/30 p-6 rounded-[2rem] border border-emerald-100">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4">🧠 Nạp tri thức</h3>
                <form onSubmit={e => { e.preventDefault(); Database.addKnowledge(newK).then(() => {setNewK({keyword:'', content:''}); onRefresh();}); }} className="space-y-3">
                  <input required placeholder="Từ khóa..." value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-white text-xs outline-none shadow-inner" />
                  <textarea required placeholder="Nội dung..." rows={2} value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-white text-xs outline-none shadow-inner" />
                  <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded-xl font-bold text-xs uppercase">Nạp</button>
                </form>
              </div>
              <div className="md:col-span-2 space-y-4">
                <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-widest px-2">Thư viện tri thức ({knowledge.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto no-scrollbar">
                  {knowledge.map(k => (
                    <div key={k.id} className="p-4 bg-white border border-slate-50 rounded-2xl relative shadow-sm">
                      <div className="flex justify-between mb-1"><span className="text-[10px] font-black text-emerald-600">#{k.keyword}</span><button onClick={() => Database.deleteKnowledge(k.id).then(onRefresh)} className="text-red-300">×</button></div>
                      <p className="text-[10px] text-slate-500 leading-relaxed truncate">{k.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-4 h-[630px]">
              <div className="flex flex-col h-[420px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-800">
                <div className="p-4 bg-slate-800 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Sandbox</span>
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Đối tượng: ${currentUser.fullName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-700 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[9px] text-emerald-500 font-black uppercase">Live Profile Data</span>
                  </div>
                </div>
                <div className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-hide bg-slate-900/50">
                  <div className="text-[9px] bg-emerald-900/30 text-emerald-400 p-2 rounded-xl border border-emerald-900/50 italic mb-2">
                    Hồ sơ: {currentUser.healthGoal} | Chỉ số: {adminMetrics.length > 0 ? 'Sẵn sàng' : 'Chưa có'}
                  </div>
                  {testMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.senderId === 'admin_test' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap ${msg.senderId === 'admin_test' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'}`}>
                        {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40" alt="Test" />}
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTestTyping && <div className="text-[10px] text-emerald-500 animate-pulse px-2">AI đang phân tích hồ sơ Admin...</div>}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-4 bg-slate-800 space-y-2">
                  {testImage && <div className="relative w-12 h-12"><img src={testImage} className="w-full h-full object-cover rounded-lg border border-emerald-500" /><button onClick={() => setTestImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[8px]">×</button></div>}
                  <div className="flex gap-2">
                    <button onClick={() => testFileInputRef.current?.click()} className="p-2 bg-slate-700 rounded-xl">📸</button>
                    <input type="file" ref={testFileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onload = () => setTestImage(r.result as string); r.readAsDataURL(f); } }} />
                    <input placeholder="Hỏi AI với hồ sơ của bạn..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestChat()} className="flex-grow bg-slate-700 rounded-xl px-3 text-xs text-white outline-none" />
                    <button onClick={handleTestChat} className="bg-emerald-600 text-white px-3 rounded-xl font-bold">🚀</button>
                  </div>
                </div>
              </div>
              <div className="flex-grow bg-black rounded-[1.5rem] p-3 overflow-y-auto font-mono text-[9px] shadow-xl no-scrollbar">
                <div className="text-emerald-500 font-bold mb-2 uppercase border-b border-emerald-900 pb-1">Console Logs</div>
                {sandboxLogs.map((log, i) => <div key={i} className={`flex gap-2 mb-1 ${log.type === 'error' ? 'text-red-500' : 'text-slate-500'}`}><span className="shrink-0">[{log.time}]</span><span className="break-words">{log.msg}</span></div>)}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
