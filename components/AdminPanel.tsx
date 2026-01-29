
import React, { useState, useEffect, useRef } from 'react';
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

const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  
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
  
  // States cho việc chọn hàng loạt
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  
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
      setSelectedMetricIds([]); // Reset selection khi đổi user
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
    setIsTestTyping(false);
    if (response) {
      setTestMessages(prev => [...prev, { id: Date.now().toString(), senderId: 'ai', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, content: response, timestamp: new Date().toISOString() }]);
    }
  };

  const handleDeleteMetric = async (metric: HealthMetric) => {
    const mid = metric.id || (metric as any)._id;
    if (!mid) return alert("Không tìm thấy ID bản ghi");
    
    if (confirm(`Bạn có chắc muốn xóa chỉ số ngày ${formatDateVN(metric.date)}?`)) {
      try {
        const res = await Database.deleteMetric(mid);
        if (res) {
          loadUserMetrics();
          onRefresh();
          alert("Đã xóa thành công!");
        }
      } catch (err) {
        alert("Lỗi khi xóa bản ghi.");
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMetricIds.length === 0) return;
    if (confirm(`Bạn có chắc muốn xóa ${selectedMetricIds.length} bản ghi đã chọn?`)) {
      try {
        await Database.deleteMetricsBulk(selectedMetricIds);
        loadUserMetrics();
        onRefresh();
        alert(`Đã xóa thành công ${selectedMetricIds.length} bản ghi!`);
      } catch (err) {
        alert("Lỗi khi xóa hàng loạt.");
      }
    }
  };

  const handleClearAllMetrics = async () => {
    if (!selectedMetricUser) return;
    const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
    
    if (confirm(`CẢNH BÁO: Bạn có chắc chắn muốn XÓA TRẮNG toàn bộ chỉ số của hội viên ${selectedMetricUser.fullName}? Hành động này không thể hoàn tác.`)) {
      if (confirm(`Xác nhận lần 2: Bạn thực sự muốn xóa sạch mọi dữ liệu đo lường của người này?`)) {
        try {
          await Database.deleteAllUserMetrics(uid);
          loadUserMetrics();
          onRefresh();
          alert("Đã xóa trắng toàn bộ dữ liệu chỉ số thành công!");
        } catch (err) {
          alert("Lỗi khi xóa trắng dữ liệu.");
        }
      }
    }
  };

  const toggleSelectMetric = (id: string) => {
    setSelectedMetricIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedMetricIds.length === userMetrics.length) {
      setSelectedMetricIds([]);
    } else {
      setSelectedMetricIds(userMetrics.map(m => (m.id || (m as any)._id)!));
    }
  };

  const handleUpdateMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMetric) return;
    const mid = editingMetric.id || (editingMetric as any)._id;
    if (!mid) return alert("Không tìm thấy ID bản ghi");

    try {
      await Database.updateMetric(mid, editingMetric);
      setEditingMetric(null);
      loadUserMetrics();
      onRefresh();
      alert("Cập nhật chỉ số thành công!");
    } catch (err) {
      alert("Lỗi khi cập nhật bản ghi.");
    }
  };

  const handleDeleteKnowledge = async (id: string, keyword: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa kiến thức về "${keyword}"?`)) {
      await Database.deleteKnowledge(id);
      onRefresh();
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa quy tắc này?")) {
      await Database.deleteRule(id);
      onRefresh();
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[75vh] flex flex-col">
      <div className="flex flex-col md:flex-row bg-slate-50/50 p-4 m-6 rounded-3xl border border-slate-100 gap-4 shrink-0">
        <div className="flex bg-white/50 p-1 rounded-2xl flex-grow overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
          <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Chỉ số</button>
          <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[100px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
        </div>
        
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
                        <button onClick={() => { if(confirm("Xóa hội viên này?")) Database.deleteUser(((u as any).id || (u as any)._id)!).then(onRefresh); }} className="text-rose-400 font-black text-[9px] hover:underline">Xóa</button>
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
              <div className="max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 space-y-2">
                {users.map(u => (
                  <div key={(u as any).id || (u as any)._id} onClick={() => setSelectedMetricUser(u)} className={`p-4 rounded-2xl border cursor-pointer transition-all ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}>
                    <div className="font-bold text-[12px]">{u.fullName}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-9 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px] flex flex-col overflow-hidden">
              {selectedMetricUser ? (
                <div className="flex flex-col h-full">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-50">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tác vụ hàng loạt:</span>
                      <button 
                        disabled={selectedMetricIds.length === 0} 
                        onClick={handleBulkDelete}
                        className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 disabled:opacity-30 transition-all"
                      >
                        Xóa đã chọn ({selectedMetricIds.length})
                      </button>
                      <button 
                        onClick={handleClearAllMetrics}
                        className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all"
                      >
                        Xóa trắng toàn bộ
                      </button>
                    </div>
                  </div>

                  {/* Thanh cuộn cố định được xử lý bằng cách giới hạn chiều cao và overflow-x */}
                  <div className="flex-grow overflow-x-auto overflow-y-auto no-scrollbar max-h-[65vh] border border-slate-50 rounded-2xl" style={{ scrollbarWidth: 'auto' }}>
                    <table className="w-full text-[11px] text-left min-w-[1300px]">
                      <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50 sticky top-0 bg-white z-10">
                        <tr>
                          <th className="p-3 w-10">
                            <input type="checkbox" checked={userMetrics.length > 0 && selectedMetricIds.length === userMetrics.length} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
                          </th>
                          <th className="p-3">Ngày</th>
                          <th className="p-3">Cân nặng (kg)</th>
                          <th className="p-3">Mỡ %</th>
                          <th className="p-3">Cơ (kg)</th>
                          <th className="p-3">Cân đối</th>
                          <th className="p-3">Nội tạng</th>
                          <th className="p-3">Khoáng (kg)</th>
                          <th className="p-3">Nước %</th>
                          <th className="p-3">Năng lượng</th>
                          <th className="p-3">Tuổi SH</th>
                          <th className="p-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {userMetrics.map(m => {
                          const mid = m.id || (m as any)._id;
                          return (
                            <tr key={mid} className={`hover:bg-slate-50/50 transition-colors ${selectedMetricIds.includes(mid) ? 'bg-emerald-50/30' : ''}`}>
                              <td className="p-3">
                                <input type="checkbox" checked={selectedMetricIds.includes(mid)} onChange={() => toggleSelectMetric(mid)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
                              </td>
                              <td className="p-3 font-bold">{formatDateVN(m.date)}</td>
                              <td className="p-3 font-black text-emerald-600">{m.weight}</td>
                              <td className="p-3 font-bold text-rose-500">{m.bodyFat}%</td>
                              <td className="p-3 font-bold text-blue-600">{m.muscleMass}</td>
                              <td className="p-3 font-black text-indigo-600">{m.balanceIndex ?? 0}</td>
                              <td className="p-3 font-bold text-amber-600">{m.visceralFat ?? '--'}</td>
                              <td className="p-3 text-slate-500">{m.boneMinerals ?? '--'}</td>
                              <td className="p-3 text-sky-600">{m.waterPercent ?? '--'}%</td>
                              <td className="p-3 text-slate-500">{m.energy ?? '--'}</td>
                              <td className="p-3 font-bold text-slate-800">{m.bioAge ?? '--'}</td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-3">
                                  <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black text-[9px] hover:underline uppercase">Sửa</button>
                                  <button onClick={() => handleDeleteMetric(m)} className="text-red-400 font-black text-[9px] hover:underline uppercase">Xóa</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {userMetrics.length === 0 && (
                          <tr><td colSpan={12} className="p-10 text-center text-slate-400 italic">Chưa có dữ liệu đo lường</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
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
                  <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 space-y-2 flex-grow pr-1">
                    {knowledge.map(k => (
                      <div key={(k as any).id || (k as any)._id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-center group border border-transparent hover:border-emerald-200 transition-all">
                        <div className="min-w-0 pr-4">
                          <div className="font-black text-[9px] text-emerald-600 uppercase truncate">{k.keyword}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1">{k.content}</div>
                        </div>
                        <button onClick={() => handleDeleteKnowledge(((k as any).id || (k as any)._id)!, k.keyword)} className="text-rose-400 hover:text-rose-600 font-black text-lg p-2">×</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 h-[250px] flex flex-col shadow-sm">
                  <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] mb-4">Danh sách Quy tắc</h4>
                  <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 space-y-2 flex-grow pr-1">
                    {rules.map(r => (
                      <div key={(r as any).id || (r as any)._id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-center group border border-transparent hover:border-emerald-200 transition-all">
                        <div className="text-[10px] font-bold text-slate-600 flex-1 pr-4">{r.content}</div>
                        <button onClick={() => handleDeleteRule(((r as any).id || (r as any)._id)!)} className="text-rose-400 hover:text-rose-600 font-black text-lg p-2">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[350px] flex flex-col shadow-2xl relative border-4 border-slate-800 shrink-0">
              <div className="mb-3 border-b border-emerald-900/50 pb-2 text-[9px] font-black uppercase tracking-widest opacity-60 flex justify-between">
                <span>> 🍀Trợ lý Lucky Sandbox Console</span>
                <button onClick={() => setTestMessages([])} className="text-emerald-700 hover:text-emerald-400 transition-colors">CLEAN</button>
              </div>
              <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-900 space-y-2 mb-4">
                {testMessages.length === 0 && <div className="text-emerald-900/30 italic opacity-40">// Nhập câu hỏi để thử nghiệm phản hồi của AI...</div>}
                {testMessages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
                    <span className="opacity-40 shrink-0">[{m.senderName}]:</span>
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                ))}
                {isTestTyping && <div className="animate-pulse text-emerald-600">> 🍀Trợ lý Lucky đang phản hồi...</div>}
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

      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-in zoom-in-95 overflow-y-auto">
          <form onSubmit={handleUpdateMetric} className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div>
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Chỉnh sửa chỉ số</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Đang chỉnh sửa bản ghi</p>
              </div>
              <button type="button" onClick={() => setEditingMetric(null)} className="text-2xl text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Ngày đo</label>
                <div className="relative group overflow-hidden">
                  <div className="w-full px-4 py-3 bg-slate-50 rounded-xl border-2 border-slate-100 group-hover:border-emerald-200 group-hover:bg-slate-100 transition-all flex items-center justify-between">
                    <span className="font-bold text-xs select-none">{formatDateVN(editingMetric.date)}</span>
                    <span className="text-sm">📅</span>
                  </div>
                  <input 
                    type="date" 
                    value={editingMetric.date} 
                    onChange={e => setEditingMetric({...editingMetric, date: e.target.value})} 
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg)</label><input type="number" step="0.1" value={editingMetric.weight} onChange={e => setEditingMetric({...editingMetric, weight: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mỡ cơ thể (%)</label><input type="number" step="0.1" value={editingMetric.bodyFat} onChange={e => setEditingMetric({...editingMetric, bodyFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Lượng cơ (kg)</label><input type="number" step="0.1" value={editingMetric.muscleMass} onChange={e => setEditingMetric({...editingMetric, muscleMass: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Cân đối</label><input type="number" step="0.1" value={editingMetric.balanceIndex} onChange={e => setEditingMetric({...editingMetric, balanceIndex: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Khoáng chất (kg)</label><input type="number" step="0.1" value={editingMetric.boneMinerals} onChange={e => setEditingMetric({...editingMetric, boneMinerals: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nước (%)</label><input type="number" step="0.1" value={editingMetric.waterPercent} onChange={e => setEditingMetric({...editingMetric, waterPercent: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Mỡ nội tạng</label><input type="number" value={editingMetric.visceralFat} onChange={e => setEditingMetric({...editingMetric, visceralFat: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Năng Lượng (kcal)</label><input type="number" value={editingMetric.energy} onChange={e => setEditingMetric({...editingMetric, energy: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-400 uppercase ml-1">Tuổi sinh học</label><input type="number" value={editingMetric.bioAge} onChange={e => setEditingMetric({...editingMetric, bioAge: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-xs" /></div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-slate-50">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] hover:bg-slate-200 transition-all">Hủy bỏ</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all">Cập nhật ngay</button>
            </div>
          </form>
        </div>
      )}

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
