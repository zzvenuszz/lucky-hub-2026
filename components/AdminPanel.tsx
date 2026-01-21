
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthGoal, HealthMetric, Permission } from '../types.ts';
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
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [allMetrics, setAllMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);

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
    if (activeTab === 'metrics') {
      Database.getMetrics().then(m => setAllMetrics(m || []));
    }
  }, [activeTab]);

  const addSandboxLog = (msg: string, type: string = 'info') => {
    setSandboxLogs(prev => [...prev.slice(-49), { 
      msg, type, time: new Date().toLocaleTimeString([], { hour12: false })
    }]);
  };

  const handleTestChat = async () => {
    if (!testInput.trim() && !testImage) return;
    const latestMetric = [...adminMetrics].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const base64Data = testImage ? testImage.split(',')[1] : undefined;
    const currentTestImage = testImage;
    const userMsg: Message = {
      id: `test_${Date.now()}`, senderId: 'admin_test', senderName: currentUser.fullName, senderRole: UserRole.ADMIN,
      content: testInput || (currentTestImage ? "[Gửi ảnh kiểm thử]" : ""), imageUrl: currentTestImage || undefined, timestamp: new Date().toISOString()
    };
    setTestMessages(prev => [...prev, userMsg]);
    const sentInput = testInput; setTestInput(''); setTestImage(null); setIsTestTyping(true);
    try {
      const aiResponse = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, sentInput || "Phân tích hồ sơ tôi", currentUser.healthGoal, latestMetric, base64Data);
      if (aiResponse) setTestMessages(prev => [...prev, { id: `ai_${Date.now()}`, senderId: 'ai_coach', senderName: 'Lucky AI', senderRole: 'AI' as any, content: aiResponse, timestamp: new Date().toISOString() }]);
    } finally { setIsTestTyping(false); }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (confirm(`⚠️ CẢNH BÁO CỰC NGUY HIỂM:\n\nBạn đang xóa tài khoản của hội viên "${name}".\nHành động này sẽ XÓA VĨNH VIỄN:\n- Toàn bộ hồ sơ cá nhân\n- Toàn bộ lịch sử chỉ số\n- Toàn bộ tin nhắn chat\n\nBạn có thực sự chắc chắn không?`)) {
      await Database.deleteUser(id);
      onRefresh();
    }
  };

  const handleToggleStatus = async (user: User) => {
    const nextStatus = user.status === AccountStatus.ACTIVE ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    await Database.updateUser(user.id, { status: nextStatus });
    onRefresh();
  };

  const handlePermissionToggle = async (user: User, perm: Permission) => {
    const perms = user.permissions || [];
    const nextPerms = perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm];
    await Database.updateUser(user.id, { permissions: nextPerms });
    onRefresh();
  };

  const handleDeleteMetric = async (id: string) => {
    if (confirm('Xóa chỉ số này?')) {
      await Database.deleteMetric(id);
      Database.getMetrics().then(m => setAllMetrics(m || []));
    }
  };

  const handleSaveEditMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMetric) return;
    const mid = editingMetric.id || editingMetric._id;
    if (mid) {
      await Database.updateMetric(mid, editingMetric);
      setEditingMetric(null);
      Database.getMetrics().then(m => setAllMetrics(m || []));
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
        <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Quản lý Chỉ số</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
      </div>

      <div className="px-8 pb-8">
        {activeTab === 'users' ? (
          <>
            <div className="mb-6 flex gap-4">
              <input placeholder="Tìm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-50">
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Hội viên</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Quyền hạn (Permissions)</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Trạng thái</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.filter(u => u.fullName.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                    <tr key={u.id} className="group hover:bg-slate-50/20">
                      <td className="py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                          <div><div className="font-bold text-slate-800">{u.fullName}</div><div className="text-[10px] text-slate-400">{u.role}</div></div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[250px]">
                          {Object.values(Permission).map(p => (
                            <button 
                              key={p} 
                              onClick={() => handlePermissionToggle(u, p)}
                              className={`text-[8px] px-2 py-0.5 rounded font-black transition-all ${u.permissions?.includes(p) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                            >
                              {p.replace('MANAGE_', '').replace('DELETE_', '❌')}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button onClick={() => handleToggleStatus(u)} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status}</button>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => handleDeleteUser(u.id, u.fullName)} className="text-[10px] font-bold text-red-400 hover:text-red-600">XÓA</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : activeTab === 'metrics' ? (
          <div className="space-y-6">
            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">Nhật ký chỉ số toàn hệ thống</h3>
            <div className="overflow-x-auto rounded-3xl border border-slate-100">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase">
                  <tr>
                    <th className="p-4">Hội viên</th>
                    <th className="p-4 text-center">Ngày</th>
                    <th className="p-4 text-center">Cân (kg)</th>
                    <th className="p-4 text-center">Mỡ (%)</th>
                    <th className="p-4 text-center">Cơ (kg)</th>
                    <th className="p-4 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allMetrics.map(m => (
                    <tr key={m.id || m._id} className="hover:bg-slate-50/50">
                      <td className="p-4 font-bold text-slate-800">{m.userFullName}</td>
                      <td className="p-4 text-center text-slate-500">{m.date}</td>
                      <td className="p-4 text-center font-black text-emerald-600">{m.weight}</td>
                      <td className="p-4 text-center text-rose-500 font-bold">{m.bodyFat}%</td>
                      <td className="p-4 text-center text-blue-600 font-bold">{m.muscleMass}</td>
                      <td className="p-4 text-right space-x-3">
                        <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-bold">Sửa</button>
                        <button onClick={() => handleDeleteMetric((m.id || m._id)!)} className="text-red-400 font-bold">Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {editingMetric && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                <form onSubmit={handleSaveEditMetric} className="bg-white w-full max-w-lg rounded-3xl p-8 space-y-4">
                  <h4 className="font-black text-slate-800 uppercase tracking-widest">Chỉnh sửa chỉ số - {editingMetric.userFullName}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Ngày</label>
                      <input type="date" value={editingMetric.date} onChange={e => setEditingMetric({...editingMetric, date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 rounded-xl outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Cân nặng (kg)</label>
                      <input type="number" step="0.1" value={editingMetric.weight} onChange={e => setEditingMetric({...editingMetric, weight: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 rounded-xl outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Mỡ (%)</label>
                      <input type="number" step="0.1" value={editingMetric.bodyFat} onChange={e => setEditingMetric({...editingMetric, bodyFat: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 rounded-xl outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Cơ (kg)</label>
                      <input type="number" step="0.1" value={editingMetric.muscleMass} onChange={e => setEditingMetric({...editingMetric, muscleMass: Number(e.target.value)})} className="w-full px-4 py-2 bg-slate-50 rounded-xl outline-none" />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold">Hủy</button>
                    <button type="submit" className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-100">Lưu thay đổi</button>
                  </div>
                </form>
              </div>
            )}
          </div>
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
            </div>

            <div className="lg:col-span-4 flex flex-col gap-4 h-[630px]">
              <div className="flex flex-col h-[420px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="p-4 bg-slate-800 flex items-center justify-between">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Sandbox</span>
                </div>
                <div className="flex-grow p-4 overflow-y-auto space-y-4 no-scrollbar bg-slate-900/50">
                  {testMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.senderId === 'admin_test' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed ${msg.senderId === 'admin_test' ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-slate-800">
                  <div className="flex gap-2">
                    <input placeholder="Hỏi AI..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestChat()} className="flex-grow bg-slate-700 rounded-xl px-3 text-xs text-white outline-none" />
                    <button onClick={handleTestChat} className="bg-emerald-600 text-white px-3 rounded-xl font-bold">🚀</button>
                  </div>
                </div>
              </div>
              <div className="flex-grow bg-black rounded-[1.5rem] p-3 overflow-y-auto font-mono text-[9px] no-scrollbar">
                <div className="text-emerald-500 font-bold mb-2 uppercase border-b border-emerald-900 pb-1">Logs</div>
                {sandboxLogs.map((log, i) => <div key={i} className="flex gap-2 mb-1 text-slate-500"><span>[{log.time}]</span><span>{log.msg}</span></div>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
