
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthMetric, Permission, HealthGoal, AuditLog, AuditLogType } from '../types.ts';
import { Database } from '../services/database.ts';
import { getAICoachResponse } from '../services/gemini.ts';

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  } catch { return dateStr; }
};

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'ai' | 'audit'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilter, setAuditFilter] = useState<string>('ALL');
  
  const [showConsole, setShowConsole] = useState(false);
  const [logFilters, setLogFilters] = useState({ system: true, ai: true });

  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  
  useEffect(() => {
    const consoleEl = document.getElementById('debug-console');
    if (consoleEl) consoleEl.style.display = showConsole ? 'flex' : 'none';
  }, [showConsole]);

  useEffect(() => {
    if (activeTab === 'audit') {
      Database.getAuditLogs().then(setAuditLogs);
    }
  }, [activeTab]);

  const loadUserMetrics = async () => {
    if (selectedMetricUser) {
      const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
      const m = await Database.getMetrics(uid);
      setUserMetrics(m || []);
      setSelectedMetricIds([]); 
    }
  };

  useEffect(() => { loadUserMetrics(); }, [selectedMetricUser]);

  const handleTestAI = async () => {
    if (!testInput.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), senderId: 'tester', senderName: 'Admin', senderRole: UserRole.ADMIN, content: testInput, timestamp: new Date().toISOString() };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setIsTestTyping(true);
    const response = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, userMsg.content, HealthGoal.BODY_RECOMP);
    setIsTestTyping(false);
    if (response) {
      setTestMessages(prev => [...prev, { id: Date.now().toString(), senderId: 'ai', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, content: response, timestamp: new Date().toISOString() }]);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa kiến thức này?')) return;
    await Database.deleteKnowledge(id);
    onRefresh();
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa quy tắc này?')) return;
    await Database.deleteRule(id);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[75vh] flex flex-col">
      <div className="flex flex-col md:flex-row bg-slate-50/50 p-4 m-6 rounded-3xl border border-slate-100 gap-4 shrink-0">
        <div className="flex bg-white/50 p-1 rounded-2xl flex-grow overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
          <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Chỉ số</button>
          <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
          <button onClick={() => setActiveTab('audit')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Nhật ký</button>
        </div>
        
        <div className="flex items-center gap-2 bg-white/50 p-1 rounded-2xl px-4">
          <button onClick={() => setShowConsole(!showConsole)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${showConsole ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400'}`}>📟</button>
        </div>
      </div>

      <div className="px-8 pb-8 flex-grow overflow-y-auto no-scrollbar">
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in">
            <input placeholder="Tìm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-50 font-black uppercase text-[10px] tracking-widest">
                  <th className="pb-4">Hội viên</th>
                  <th className="pb-4">Vai trò</th>
                  <th className="pb-4">Trạng thái</th>
                  <th className="pb-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.filter(u => u.fullName.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                  <tr key={(u as any).id || (u as any)._id} className="group hover:bg-slate-50/20">
                    <td className="py-5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                      <div><div className="font-bold text-slate-800">{u.fullName}</div><div className="text-[10px] text-slate-400">@{u.username}</div></div>
                    </td>
                    <td><span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase">{u.role}</span></td>
                    <td><span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{u.status}</span></td>
                    <td className="text-right space-x-3">
                      <button onClick={() => setEditingUser(u)} className="text-emerald-600 font-black text-[9px] hover:underline">Sửa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lọc theo sự kiện:</span>
              <select 
                value={auditFilter} 
                onChange={e => setAuditFilter(e.target.value)}
                className="bg-white border-slate-200 rounded-lg text-xs font-bold px-3 py-1.5 outline-none ring-1 ring-slate-100"
              >
                <option value="ALL">Tất cả</option>
                <option value={AuditLogType.REGISTER}>Đăng ký mới</option>
                <option value={AuditLogType.POST_CREATE}>Bài viết mới</option>
                <option value={AuditLogType.METRIC_UPDATE}>Tự cập nhật chỉ số</option>
                <option value={AuditLogType.METRIC_HELP_UPDATE}>Cập nhật chỉ số giúp</option>
              </select>
            </div>
            <div className="overflow-x-auto border border-slate-50 rounded-2xl">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Thời gian</th>
                    <th className="p-4">Người thực hiện</th>
                    <th className="p-4">Loại sự kiện</th>
                    <th className="p-4">Đối tượng tác động</th>
                    <th className="p-4">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {auditLogs
                    .filter(log => auditFilter === 'ALL' || log.type === auditFilter)
                    .map(log => (
                    <tr key={log._id || log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 whitespace-nowrap text-slate-400">{new Date(log.timestamp).toLocaleString('vi-VN')}</td>
                      <td className="p-4">
                        <div className="font-bold text-slate-700">{log.actorName}</div>
                        <div className="text-[9px] text-slate-400">ID: {log.actorId}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${
                          log.type === AuditLogType.REGISTER ? 'bg-blue-100 text-blue-600' :
                          log.type === AuditLogType.POST_CREATE ? 'bg-purple-100 text-purple-600' :
                          log.type === AuditLogType.METRIC_HELP_UPDATE ? 'bg-amber-100 text-amber-600' :
                          'bg-emerald-100 text-emerald-600'
                        }`}>
                          {log.type === AuditLogType.REGISTER ? 'Đăng ký' :
                           log.type === AuditLogType.POST_CREATE ? 'Bài viết' :
                           log.type === AuditLogType.METRIC_HELP_UPDATE ? 'Cập nhật giúp' : 'Tự cập nhật'}
                        </span>
                      </td>
                      <td className="p-4">
                        {log.targetName ? (
                          <>
                            <div className="font-bold text-slate-700">{log.targetName}</div>
                            <div className="text-[9px] text-slate-400">ID: {log.targetId}</div>
                          </>
                        ) : '--'}
                      </td>
                      <td className="p-4 text-slate-600 italic">{log.details}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-300 italic uppercase font-black text-[10px] tracking-widest">Chưa có nhật ký hoạt động</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {activeTab === 'metrics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in">
             <div className="lg:col-span-3 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
              <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">Hội viên</h3>
              <div className="max-h-[500px] overflow-y-auto no-scrollbar space-y-2">
                {users.map(u => (
                  <div key={(u as any).id || (u as any)._id} onClick={() => setSelectedMetricUser(u)} className={`p-4 rounded-2xl border cursor-pointer transition-all ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}>
                    <div className="font-bold text-[12px]">{u.fullName}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-9 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
              {selectedMetricUser ? (
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-[11px] text-left min-w-[1000px]">
                    <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                      <tr><th className="p-3">Ngày</th><th className="p-3">Cân nặng</th><th className="p-3">Mỡ %</th><th className="p-3">Cơ</th><th className="p-3 text-right">Thao tác</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {userMetrics.map(m => (
                        <tr key={m.id || (m as any)._id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold">{formatDateVN(m.date)}</td>
                          <td className="p-3 text-emerald-600 font-black">{m.weight}kg</td>
                          <td className="p-3 text-rose-500 font-bold">{m.bodyFat}%</td>
                          <td className="p-3 text-blue-600 font-bold">{m.muscleMass}kg</td>
                          <td className="p-3 text-right">
                             <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black text-[9px] hover:underline uppercase">Sửa</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="p-20 text-center text-slate-300 uppercase text-[10px] font-black tracking-widest">Chọn hội viên để xem chỉ số</div>}
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-10 animate-in fade-in">
            {/* Form Thêm Quy tắc & Kiến thức */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
                <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
                  <span className="text-lg">📚</span> Thêm Kiến thức (Knowledge)
                </h4>
                <div className="space-y-3">
                  <input placeholder="Từ khóa (Ví dụ: Giảm cân, Nước...)" value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 bg-white" />
                  <textarea placeholder="Nội dung AI sẽ trả lời..." value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm h-32 border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none bg-white" />
                </div>
                <button onClick={() => { if(!newK.keyword || !newK.content) return; Database.addKnowledge(newK).then(() => { setNewK({keyword: '', content: ''}); onRefresh(); }); }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Lưu kiến thức</button>
              </div>

              <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 space-y-4 shadow-sm">
                <h4 className="font-black text-blue-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
                  <span className="text-lg">⚖️</span> Thêm Quy tắc (Rules)
                </h4>
                <div className="space-y-3">
                  <textarea placeholder="Quy tắc huấn luyện (Ví dụ: Luôn chào hỏi thân thiện...)" value={newRule} onChange={e => setNewRule(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm h-[13.5rem] border-none outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-white" />
                </div>
                <button onClick={() => { if(!newRule) return; Database.addRule({content: newRule}).then(() => { setNewRule(''); onRefresh(); }); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Lưu quy tắc</button>
              </div>
            </div>

            {/* Danh sách Quản lý Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Kiến thức ({knowledge.length})</h4>
                <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3 pr-2">
                  {knowledge.map(k => (
                    <div key={k.id || (k as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group">
                      <div className="space-y-1">
                        <div className="font-black text-emerald-600 text-xs uppercase tracking-tight">{k.keyword}</div>
                        <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">{k.content}</div>
                      </div>
                      <button onClick={() => handleDeleteKnowledge(k.id || (k as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
                    </div>
                  ))}
                  {knowledge.length === 0 && <div className="text-center py-10 text-slate-300 italic text-[11px] uppercase font-black">Chưa có kiến thức</div>}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Quy tắc ({rules.length})</h4>
                <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3 pr-2">
                  {rules.map((r, i) => (
                    <div key={r.id || (r as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group">
                      <div className="space-y-1">
                        <div className="font-black text-blue-600 text-[9px] uppercase tracking-widest">Quy tắc #{i+1}</div>
                        <div className="text-[11px] text-slate-600 leading-relaxed font-medium">{r.content}</div>
                      </div>
                      <button onClick={() => handleDeleteRule(r.id || (r as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
                    </div>
                  ))}
                  {rules.length === 0 && <div className="text-center py-10 text-slate-300 italic text-[11px] uppercase font-black">Chưa có quy tắc</div>}
                </div>
              </div>
            </div>

            {/* AI Test Lab */}
            <div className="space-y-4">
              <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Thử nghiệm phản hồi AI (Test Lab)</h4>
              <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[350px] flex flex-col border-4 border-slate-800 relative shadow-2xl">
                <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-2 no-scrollbar">
                  <div className="text-emerald-500/50 italic mb-4"># Terminal v2.0 - Lucky AI Training Environment...</div>
                  {testMessages.map((m, i) => (
                    <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
                      <span className="opacity-40 shrink-0">[{m.senderName}]:</span>
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    </div>
                  ))}
                  {isTestTyping && <div className="animate-pulse text-emerald-600">_ AI đang suy nghĩ...</div>}
                </div>
                <div className="flex items-center gap-2 border-t border-slate-800 pt-4">
                  <span className="text-emerald-600 font-black">PROMPT&gt;</span>
                  <input placeholder="Nhập câu hỏi test..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestAI()} className="flex-grow bg-transparent border-none px-4 py-2 text-emerald-400 outline-none placeholder:text-emerald-900/50" />
                  <button onClick={handleTestAI} className="bg-emerald-800/30 hover:bg-emerald-800/50 text-emerald-400 px-4 py-1 rounded-lg transition-all border border-emerald-800/50 text-[10px] font-black uppercase tracking-widest">Gửi</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4">
          <form onSubmit={async (e) => { e.preventDefault(); await Database.updateUser((editingUser as any).id || (editingUser as any)._id, editingUser); setEditingUser(null); onRefresh(); }} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật Hội viên</h4>
            <div className="grid grid-cols-2 gap-4">
              <input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs">{Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}</select>
            </div>
            <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-xs">{Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}</select>
            <button type="submit" className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu thông tin</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
