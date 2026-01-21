
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthGoal } from '../types.ts';
import { Database } from '../services/database.ts';
import { getAICoachResponse } from '../services/gemini.ts';

interface AdminPanelProps {
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  // States cho Knowledge
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  
  // States cho Rules
  const [newRule, setNewRule] = useState('');
  
  // States cho AI Test Chat (Sandbox)
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [testImage, setTestImage] = useState<string | null>(null);
  const [simulatedGoal, setSimulatedGoal] = useState<HealthGoal>(HealthGoal.STRENGTHEN_HEALTH);
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [sandboxLogs, setSandboxLogs] = useState<{msg: string, type: string, time: string}[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const testFileInputRef = useRef<HTMLInputElement>(null);

  // Lắng nghe logs từ gemini service
  useEffect(() => {
    const handleGlobalLog = (e: any) => {
      if (activeTab === 'ai') {
        addSandboxLog(e.detail.msg, e.detail.type);
      }
    };
    window.addEventListener('ai-sandbox-log', handleGlobalLog);
    return () => window.removeEventListener('ai-sandbox-log', handleGlobalLog);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [testMessages, isTestTyping]);

  useEffect(() => {
    if (activeTab === 'ai' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sandboxLogs]);

  const addSandboxLog = (msg: string, type: string = 'info') => {
    setSandboxLogs(prev => [...prev.slice(-49), { 
      msg,
      type,
      time: new Date().toLocaleTimeString([], { hour12: false })
    }]);
  };

  const handleResetPassword = async (id: string) => {
    if (confirm('Xác nhận reset mật khẩu người dùng này?')) {
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

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newK.keyword || !newK.content) return;
    setIsSubmitting(true);
    try {
      await Database.addKnowledge(newK);
      setNewK({ keyword: '', content: '' });
      onRefresh();
    } finally { setIsSubmitting(false); }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (confirm('Xóa kiến thức này?')) {
      await Database.deleteKnowledge(id);
      onRefresh();
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.trim()) return;
    setIsSubmitting(true);
    try {
      await Database.addRule({ content: newRule });
      setNewRule('');
      onRefresh();
    } finally { setIsSubmitting(false); }
  };

  const handleDeleteRule = async (id: string) => {
    if (confirm('Xóa quy chuẩn này?')) {
      await Database.deleteRule(id);
      onRefresh();
    }
  };

  const handleTestFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setTestImage(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Logic AI Sandbox (Test Chat)
  const handleTestChat = async () => {
    if (!testInput.trim() && !testImage) return;
    
    addSandboxLog(`[Admin-Test] Gửi yêu cầu với mục tiêu giả lập: ${simulatedGoal}`, 'user');
    
    const base64Data = testImage ? testImage.split(',')[1] : undefined;
    const currentTestImage = testImage;

    const userMsg: Message = {
      id: `test_${Date.now()}`,
      senderId: 'admin_test',
      senderName: 'Admin-Test',
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
        sentInput || "Phân tích hình ảnh này",
        simulatedGoal,
        undefined, // Sandbox hiện chưa lấy metrics thực tế của admin
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

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100">
        <button onClick={() => { setActiveTab('users'); setSearchTerm(''); }} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Quản lý Người dùng</button>
        <button onClick={() => { setActiveTab('ai'); setSearchTerm(''); }} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI & Sandbox</button>
      </div>

      <div className="px-8 pb-8">
        {activeTab === 'users' ? (
          <>
            <div className="mb-6">
              <input 
                placeholder="Tìm kiếm hội viên..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm transition-all shadow-inner"
              />
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
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="group hover:bg-slate-50/30 transition-colors">
                      <td className="py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                          <div>
                            <div className="font-bold text-slate-800">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select 
                          value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="text-[10px] font-black uppercase tracking-tighter bg-slate-100 border-none rounded-lg px-2 py-1 outline-none"
                        >
                          <option value={UserRole.MEMBER}>Hội viên</option>
                          <option value={UserRole.COACH}>HLV</option>
                          <option value={UserRole.ADMIN}>Admin</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => handleToggleStatus(u)} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.status}
                        </button>
                      </td>
                      <td className="text-right">
                        <button onClick={() => handleResetPassword(u.id)} className="text-[10px] font-bold text-emerald-600 hover:underline">Reset</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2"><span>⚖️</span> Quy chuẩn AI</h3>
                <form onSubmit={handleAddRule} className="flex gap-2 mb-4">
                  <input placeholder="Quy tắc mới..." value={newRule} onChange={e => setNewRule(e.target.value)} className="flex-grow px-4 py-2 bg-white rounded-xl border-none text-xs outline-none shadow-inner" />
                  <button type="submit" className="bg-emerald-600 text-white px-3 rounded-xl">+</button>
                </form>
                <div className="space-y-2 max-h-[140px] overflow-y-auto no-scrollbar">
                  {rules.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded-xl text-[10px] group border border-slate-100">
                      <span className="text-slate-600 italic">"{r.content}"</span>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50/30 p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2"><span>🧠</span> Nạp tri thức</h3>
                <form onSubmit={handleAddKnowledge} className="space-y-3">
                  <input required placeholder="Từ khóa..." value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-white border-none text-xs outline-none shadow-inner" />
                  <textarea required placeholder="Nội dung chuyên sâu..." rows={3} value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-white border-none text-xs resize-none outline-none shadow-inner" />
                  <button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs uppercase shadow-lg shadow-emerald-100">Xác nhận nạp tri thức</button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-[0.2em] px-2 flex justify-between">Thư viện tri thức <span>({knowledge.length})</span></h3>
              <div className="space-y-3 max-h-[580px] overflow-y-auto no-scrollbar">
                {knowledge.map(k => (
                  <div key={k.id} className="p-4 bg-white border border-slate-50 rounded-2xl group relative shadow-sm hover:border-emerald-200">
                    <div className="flex justify-between mb-1"><span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-md">#{k.keyword}</span><button onClick={() => handleDeleteKnowledge(k.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500">×</button></div>
                    <p className="text-[10px] text-slate-500 leading-relaxed truncate group-hover:whitespace-normal">{k.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-4 h-[630px]">
              <div className="flex flex-col h-[420px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-800">
                <div className="p-4 bg-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">AI Sandbox</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select 
                      value={simulatedGoal} onChange={e => setSimulatedGoal(e.target.value as HealthGoal)}
                      className="bg-slate-700 text-[9px] text-emerald-400 font-black uppercase tracking-tighter border-none rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {Object.values(HealthGoal).map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <button onClick={() => { setTestMessages([]); setSandboxLogs([]); }} className="text-[9px] font-bold text-slate-500 hover:text-white uppercase px-2 py-1 rounded-lg">Reset</button>
                  </div>
                </div>
                
                <div className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-hide bg-slate-900/50">
                  {testMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40">
                      <span className="text-4xl mb-2">📸</span>
                      <p className="text-[9px] font-black uppercase tracking-widest">Chọn ảnh & Hỏi để test AI</p>
                    </div>
                  )}
                  {testMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.senderId === 'admin_test' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] shadow-sm leading-relaxed whitespace-pre-wrap ${msg.senderId === 'admin_test' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'}`}>
                        {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40 border-2 border-slate-700" alt="Test attachment" />}
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTestTyping && <div className="flex gap-1 items-center px-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-slate-800 space-y-3">
                  {testImage && (
                    <div className="relative w-16 h-16 ml-1 animate-in slide-in-from-bottom-2">
                      <img src={testImage} className="w-full h-full object-cover rounded-xl border-2 border-emerald-500" alt="Preview" />
                      <button onClick={() => setTestImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-[10px]">×</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button 
                      onClick={() => testFileInputRef.current?.click()}
                      className="w-11 h-11 bg-slate-700 text-slate-400 rounded-xl flex items-center justify-center hover:bg-emerald-900 transition-colors shadow-inner"
                      title="Gửi ảnh kiểm thử"
                    >📸</button>
                    <input type="file" ref={testFileInputRef} className="hidden" accept="image/*" onChange={handleTestFileChange} />
                    <input 
                      placeholder="Nhập nội dung hỏi AI..." 
                      value={testInput} onChange={e => setTestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleTestChat()}
                      className="flex-grow bg-slate-700 border-none rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                    />
                    <button onClick={handleTestChat} className="bg-emerald-600 text-white px-4 rounded-xl hover:bg-emerald-700 shadow-md">🚀</button>
                  </div>
                </div>
              </div>

              <div className="flex-grow bg-black rounded-[1.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-xl">
                <div className="bg-slate-900 px-4 py-2 flex items-center border-b border-slate-800">
                  <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5"></span>
                  <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Console Logs</span>
                </div>
                <div className="flex-grow p-3 overflow-y-auto font-mono text-[9px] space-y-1.5 no-scrollbar bg-black/90">
                  {sandboxLogs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-500' : log.type === 'success' ? 'text-emerald-500' : log.type === 'warning' ? 'text-amber-500' : 'text-slate-500'}`}>
                      <span className="text-slate-700 shrink-0 font-bold">[{log.time}]</span>
                      <span className="break-words">{log.msg}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
