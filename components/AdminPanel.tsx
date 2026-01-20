
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message } from '../types.ts';
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
  
  // States cho AI Test Chat
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [sandboxLogs, setSandboxLogs] = useState<{msg: string, type: string, time: string}[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

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
    setSandboxLogs(prev => [...prev.slice(-49), { // Chỉ giữ 50 logs gần nhất để mượt
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

  // Logic Knowledge
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

  // Logic Rules
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

  // Logic AI Sandbox (Test Chat)
  const handleTestChat = async () => {
    if (!testInput.trim()) return;
    
    addSandboxLog(`[User] ${testInput}`, 'user');
    
    const userMsg: Message = {
      id: `test_${Date.now()}`,
      senderId: 'admin_test',
      senderName: 'Admin',
      senderRole: UserRole.ADMIN,
      content: testInput,
      timestamp: new Date().toISOString()
    };
    
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setIsTestTyping(true);
    
    try {
      const aiResponse = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, testInput);
      
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
      addSandboxLog(`Lỗi Sandbox nghiêm trọng: ${err.message}`, "error");
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
                placeholder="Tìm kiếm hội viên theo tên hoặc username..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm transition-all shadow-inner"
              />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-50">
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Thông tin hội viên</th>
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
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400">@{u.username} • {u.phoneNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select 
                          value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="text-[10px] font-black uppercase tracking-tighter bg-slate-100 border-none rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value={UserRole.MEMBER}>Hội viên</option>
                          <option value={UserRole.COACH}>HLV</option>
                          <option value={UserRole.ADMIN}>Admin</option>
                        </select>
                      </td>
                      <td>
                        <button onClick={() => handleToggleStatus(u)} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                          {u.status}
                        </button>
                      </td>
                      <td className="text-right">
                        <button onClick={() => handleResetPassword(u.id)} className="text-[10px] font-bold text-emerald-600 hover:underline">Reset Pass</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cột 1: Cấu hình Rules & Knowledge */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="text-lg">⚖️</span> Tiêu chuẩn giao tiếp
                </h3>
                <form onSubmit={handleAddRule} className="flex gap-2 mb-4">
                  <input 
                    placeholder="VD: Luôn xưng hô lễ phép..." 
                    value={newRule} onChange={e => setNewRule(e.target.value)}
                    className="flex-grow px-4 py-2 bg-white rounded-xl border-none text-xs font-medium outline-none focus:ring-1 focus:ring-emerald-500 shadow-inner"
                  />
                  <button type="submit" className="bg-emerald-600 text-white px-3 rounded-xl text-lg hover:bg-emerald-700 shadow-md">+</button>
                </form>
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-2 no-scrollbar">
                  {rules.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-white rounded-xl text-[10px] group border border-slate-100">
                      <span className="text-slate-600 font-medium italic">"{r.content}"</span>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">×</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50/30 p-6 rounded-[2rem] border border-emerald-100 shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="text-lg">🧠</span> Nạp tri thức (Knowledge)
                </h3>
                <form onSubmit={handleAddKnowledge} className="space-y-3">
                  <input 
                    required placeholder="Từ khóa (VD: BMI, Protein...)" 
                    value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} 
                    className="w-full px-4 py-2.5 rounded-xl bg-white border-none text-xs font-medium outline-none shadow-inner" 
                  />
                  <textarea 
                    required placeholder="Nội dung chuyên môn để AI học tập..." rows={4} 
                    value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} 
                    className="w-full px-4 py-2.5 rounded-xl bg-white border-none text-xs font-medium resize-none outline-none shadow-inner" 
                  />
                  <button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700">
                    {isSubmitting ? 'Đang nạp...' : 'Xác nhận nạp tri thức'}
                  </button>
                </form>
              </div>
            </div>

            {/* Cột 2: Tri thức hiện có */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="font-black text-slate-400 text-[9px] uppercase tracking-[0.2em] px-2 flex justify-between">
                Thư viện tri thức <span>({knowledge.length})</span>
              </h3>
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 no-scrollbar">
                {knowledge.map(k => (
                  <div key={k.id} className="p-4 bg-white border border-slate-50 rounded-2xl group relative shadow-sm hover:border-emerald-200 transition-all">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-md">#{k.keyword}</span>
                      <button onClick={() => handleDeleteKnowledge(k.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">×</button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed truncate group-hover:whitespace-normal">{k.content}</p>
                  </div>
                ))}
                {knowledge.length === 0 && <div className="text-center py-10 text-slate-300 italic text-xs">Thư viện trống</div>}
              </div>
            </div>

            {/* Cột 3: AI Sandbox & Debug Logs */}
            <div className="lg:col-span-4 flex flex-col gap-4 h-[630px]">
              {/* AI Sandbox Chat */}
              <div className="flex flex-col h-[400px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-slate-800">
                <div className="p-4 bg-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">AI Sandbox (Flash-3)</span>
                  </div>
                  <button onClick={() => { setTestMessages([]); setSandboxLogs([]); }} className="text-[9px] font-bold text-slate-500 hover:text-white uppercase px-2 py-1 rounded-lg hover:bg-slate-700">Clear</button>
                </div>
                
                <div className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-hide bg-slate-900/50">
                  {testMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 opacity-50 text-center px-4">
                      <span className="text-4xl">🤖</span>
                      <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed">Hãy hỏi AI để kiểm tra<br/>quy tắc & kiến thức mới</p>
                    </div>
                  )}
                  {testMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.senderId === 'admin_test' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] shadow-sm leading-relaxed ${
                        msg.senderId === 'admin_test' ? 'bg-emerald-600 text-white rounded-tr-none' : msg.content.startsWith('LỖI') ? 'bg-red-900/50 text-red-200 border border-red-800 rounded-tl-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTestTyping && (
                    <div className="flex gap-1 items-center px-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 bg-slate-800 flex gap-2">
                  <input 
                    placeholder="Hỏi AI tại đây..." 
                    value={testInput} onChange={e => setTestInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTestChat()}
                    className="flex-grow bg-slate-700 border-none rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500 shadow-inner"
                  />
                  <button 
                    onClick={handleTestChat}
                    disabled={isTestTyping || !testInput.trim()}
                    className="bg-emerald-600 text-white px-4 rounded-xl text-sm hover:bg-emerald-700 disabled:opacity-50 shadow-md active:scale-95 transition-all"
                  >
                    🚀
                  </button>
                </div>
              </div>

              {/* Debug Logs Panel (TERMINAL) */}
              <div className="flex-grow bg-black rounded-[1.5rem] border border-slate-800 flex flex-col overflow-hidden shadow-xl">
                <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Internal Debug Console</span>
                  </div>
                  <span className="text-[8px] text-slate-600 font-mono">UTF-8</span>
                </div>
                <div className="flex-grow p-3 overflow-y-auto font-mono text-[9px] space-y-1.5 no-scrollbar bg-black/90">
                  {sandboxLogs.length === 0 && <div className="text-slate-800 italic">Waiting for AI activity...</div>}
                  {sandboxLogs.map((log, i) => (
                    <div key={i} className={`flex gap-2 leading-relaxed ${
                      log.type === 'error' ? 'text-red-500' : 
                      log.type === 'success' ? 'text-emerald-500' : 
                      log.type === 'warning' ? 'text-amber-500' :
                      log.type === 'system' ? 'text-blue-500' : 
                      log.type === 'user' ? 'text-slate-300' : 'text-slate-500'
                    }`}>
                      <span className="text-slate-700 shrink-0 font-bold">[{log.time}]</span>
                      <span className="break-words">
                        {log.type === 'error' ? '✖ ' : log.type === 'success' ? '✔ ' : log.type === 'warning' ? '⚠ ' : 'i '}
                        {log.msg}
                      </span>
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
