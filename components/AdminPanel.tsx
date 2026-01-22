
import React, { useState, useEffect } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthMetric, Permission, HealthGoal } from '../types.ts';
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
  
  // Debug settings
  const [showConsole, setShowConsole] = useState(false);
  const [logFilters, setLogFilters] = useState({ system: true, ai: true });

  // AI Management
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');

  // Member & Metrics
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);

  useEffect(() => {
    const consoleEl = document.getElementById('debug-console');
    if (consoleEl) consoleEl.style.display = showConsole ? 'flex' : 'none';
  }, [showConsole]);

  useEffect(() => {
    (window as any).logFilters = logFilters;
  }, [logFilters]);

  const loadUserMetrics = async () => {
    if (selectedMetricUser) {
      const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
      const m = await Database.getMetrics(uid);
      setUserMetrics(m || []);
    }
  };

  useEffect(() => {
    loadUserMetrics();
  }, [selectedMetricUser]);

  const handleTestAI = async () => {
    if (!testInput.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), senderId: 'tester', senderName: 'Admin', senderRole: UserRole.ADMIN, content: testInput, timestamp: new Date().toISOString() };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setIsTestTyping(true);
    const response = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, userMsg.content, HealthGoal.BODY_RECOMP);
    setIsTestTyping(true); // Gemini AI typing
    setIsTestTyping(false);
    if (response) {
      setTestMessages(prev => [...prev, { id: Date.now().toString(), senderId: 'ai', senderName: 'Lucky AI', senderRole: 'AI' as any, content: response, timestamp: new Date().toISOString() }]);
    }
  };

  const handleDeleteMetric = async (metric: HealthMetric) => {
    const mid = metric.id || (metric as any)._id;
    if (confirm('Bạn có chắc chắn muốn xóa bản ghi chỉ số ngày ' + metric.date + '?')) {
      const success = await Database.deleteMetric(mid);
      loadUserMetrics();
      onRefresh(); // Cập nhật dashboard nếu cần
    }
  };

  const handleUpdateMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMetric) return;
    const mid = editingMetric.id || (editingMetric as any)._id;
    await Database.updateMetric(mid, editingMetric);
    setEditingMetric(null);
    loadUserMetrics();
    onRefresh();
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[75vh] flex flex-col">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row bg-slate-50/50 p-4 m-6 rounded-3xl border border-slate-100 gap-4 shrink-0">
        <div className="flex bg-white/50 p-1 rounded-2xl flex-grow overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
          <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Chỉ số</button>
          <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
        </div>
        
        {/* Debug Controls */}
        <div className="flex items-center gap-2 bg-white/50 p-1 rounded-2xl px-4">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Gỡ lỗi:</span>
          <button onClick={() => setShowConsole(!showConsole)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${showConsole ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-slate-100 text-slate-400'}`}>📟</button>
          <button onClick={() => setLogFilters(prev => ({...prev, system: !prev.system}))} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${logFilters.system ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>Hệ thống</button>
          <button onClick={() => setLogFilters(prev => ({...prev, ai: !prev.ai}))} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${logFilters.ai ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'}`}>AI</button>
        </div>
      </div>

      <div className="px-8 pb-8 flex-grow overflow-y-auto no-scrollbar">
        {activeTab === 'users' ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <input placeholder="Tìm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" />
            <div className="overflow-x-auto no-scrollbar">
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
                        <button onClick={() => Database.deleteUser(((u as any).id || (u as any)._id)!).then(onRefresh)} className="text-rose-400 font-black text-[9px] hover:underline">Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'metrics' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
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
                  <table className="w-full text-[11px] text-left min-w-[600px]">
                    <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                      <tr><th className="p-3">Ngày</th><th className="p-3">Cân (kg)</th><th className="p-3">Mỡ %</th><th className="p-3">Cơ (kg)</th><th className="p-3 text-right">Thao tác</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {userMetrics.map(m => (
                        <tr key={(m as any).id || (m as any)._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold">{new Date(m.date).toLocaleDateString('vi-VN')}</td>
                          <td className="p-3 font-black text-emerald-600">{m.weight}</td>
                          <td className="p-3 font-bold text-rose-500">{m.bodyFat}%</td>
                          <td className="p-3 font-bold text-blue-600">{m.muscleMass}</td>
                          <td className="p-3 text-right space-x-4">
                            <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black text-[9px] hover:underline uppercase">Sửa</button>
                            <button onClick={() => handleDeleteMetric(m)} className="text-red-400 font-black text-[9px] hover:underline uppercase">Xóa</button>
                          </td>
                        </tr>
                      ))}
                      {userMetrics.length === 0 && (
                        <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">Chưa có dữ liệu đo lường</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 p-20 text-center uppercase text-[10px] font-black tracking-widest">Chọn hội viên bên trái để quản lý chỉ số</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300 flex flex-col min-h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
                  <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[10px]">Cập nhật Kiến thức (Knowledge)</h4>
                  <input placeholder="Từ khóa..." value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm border-none outline-none focus:ring-1 focus:ring-emerald-500" />
                  <textarea placeholder="Nội dung AI sẽ trả lời..." value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm h-32 border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
                  <button onClick={() => { Database.addKnowledge(newK).then(() => { setNewK({keyword: '', content: ''}); onRefresh(); }); }} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all">Lưu kiến thức</button>
                </div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                  <h4 className="font-black text-slate-700 uppercase tracking-widest text-[10px]">Thêm Quy tắc (Rules)</h4>
                  <div className="flex gap-2">
                    <input placeholder="VD: Phải luôn động viên..." value={newRule} onChange={e => setNewRule(e.target.value)} className="flex-grow px-4 py-3 rounded-xl text-sm border-none outline-none focus:ring-1 focus:ring-emerald-500" />
                    <button onClick={() => { Database.addRule({content: newRule}).then(() => { setNewRule(''); onRefresh(); }); }} className="bg-slate-700 text-white px-6 rounded-xl font-black text-[10px] uppercase">Thêm</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 min-h-0">
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 h-[250px] flex flex-col shadow-sm">
                  <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] mb-4">Danh sách Kiến thức</h4>
                  <div className="overflow-y-auto space-y-2 no-scrollbar flex-grow pr-1">
                    {knowledge.map(k => (
                      <div key={k.id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-center group border border-transparent hover:border-emerald-200 transition-all">
                        <div className="min-w-0 pr-4">
                          <div className="font-black text-[9px] text-emerald-600 uppercase truncate">{k.keyword}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">{k.content}</div>
                        </div>
                        <button onClick={() => Database.deleteKnowledge(k.id).then(onRefresh)} className="text-rose-400 hover:text-rose-600 font-black text-lg p-2">×</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 h-[250px] flex flex-col shadow-sm">
                  <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] mb-4">Danh sách Quy tắc</h4>
                  <div className="overflow-y-auto space-y-2 no-scrollbar flex-grow pr-1">
                    {rules.map(r => (
                      <div key={r.id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-center group border border-transparent hover:border-emerald-200 transition-all">
                        <div className="text-[10px] font-bold text-slate-600 flex-1 pr-4">{r.content}</div>
                        <button onClick={() => Database.deleteRule(r.id).then(onRefresh)} className="text-rose-400 hover:text-rose-600 font-black text-lg p-2">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Sandbox Console */}
            <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[350px] flex flex-col shadow-2xl relative border-4 border-slate-800 shrink-0">
              <div className="mb-3 border-b border-emerald-900/50 pb-2 text-[9px] font-black uppercase tracking-widest opacity-60 flex justify-between">
                <span>> Lucky AI Sandbox Console</span>
                <button onClick={() => setTestMessages([])} className="text-emerald-700 hover:text-emerald-400 transition-colors">CLEAN</button>
              </div>
              <div className="flex-grow overflow-y-auto space-y-2 no-scrollbar mb-4">
                {testMessages.length === 0 && <div className="text-emerald-900/30 italic opacity-40">// Nhập câu hỏi để thử nghiệm phản hồi của AI...</div>}
                {testMessages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
                    <span className="opacity-40 shrink-0">[{m.senderName}]:</span>
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                ))}
                {isTestTyping && <div className="animate-pulse text-emerald-600">> AI đang phản hồi...</div>}
              </div>
              <div className="flex gap-2 p-1.5 bg-emerald-950/20 rounded-xl border border-emerald-900/30">
                <span className="pl-3 py-2 text-emerald-600 font-black">></span>
                <input placeholder="Nhập câu hỏi test..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestAI()} className="flex-grow bg-transparent border-none px-2 py-2 text-emerald-400 outline-none placeholder:text-emerald-900/30" />
                <button onClick={handleTestAI} className="bg-emerald-800 text-emerald-300 px-4 rounded-lg font-black text-[9px] uppercase hover:bg-emerald-700 transition-all">Execute</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Sửa Chỉ Số - HOÀN THIỆN ĐẦY ĐỦ CÁC TRƯỜNG */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-in zoom-in-95 overflow-y-auto">
          <form onSubmit={handleUpdateMetric} className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div>
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Chỉnh sửa chỉ số</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Ngày đo: {editingMetric.date}</p>
              </div>
              <button type="button" onClick={() => setEditingMetric(null)} className="text-2xl text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label>
                <input type="number" step="0.1" value={editingMetric.weight} onChange={e => setEditingMetric({...editingMetric, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tỉ lệ mỡ (%)</label>
                <input type="number" step="0.1" value={editingMetric.bodyFat} onChange={e => setEditingMetric({...editingMetric, bodyFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Cơ bắp (kg)</label>
                <input type="number" step="0.1" value={editingMetric.muscleMass} onChange={e => setEditingMetric({...editingMetric, muscleMass: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Khối xương (kg)</label>
                <input type="number" step="0.1" value={editingMetric.boneMinerals} onChange={e => setEditingMetric({...editingMetric, boneMinerals: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Lượng nước (%)</label>
                <input type="number" step="0.1" value={editingMetric.waterPercent} onChange={e => setEditingMetric({...editingMetric, waterPercent: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mỡ nội tạng</label>
                <input type="number" value={editingMetric.visceralFat} onChange={e => setEditingMetric({...editingMetric, visceralFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">BMR (kcal)</label>
                <input type="number" value={editingMetric.energy} onChange={e => setEditingMetric({...editingMetric, energy: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tuổi sinh học</label>
                <input type="number" value={editingMetric.bioAge} onChange={e => setEditingMetric({...editingMetric, bioAge: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" />
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-50">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] hover:bg-slate-200 transition-all">Hủy bỏ</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all">Cập nhật ngay</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Sửa Hội viên */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4 animate-in zoom-in-95">
          <form onSubmit={async (e) => { e.preventDefault(); await Database.updateUser((editingUser as any).id || (editingUser as any)._id, editingUser); setEditingUser(null); onRefresh(); }} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4"><h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật Hội viên</h4><button type="button" onClick={() => setEditingUser(null)} className="text-2xl text-slate-400">&times;</button></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ và tên</label><input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Vai trò</label><select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl outline-none border border-emerald-100 font-bold text-xs">{Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}</select></div>
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase ml-1">Trạng thái</label><select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 font-bold text-xs">{Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] hover:bg-slate-200">Hủy</button><button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg shadow-emerald-100 active:scale-95 transition-all">Lưu thông tin</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
