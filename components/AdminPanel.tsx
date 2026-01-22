
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
  
  // Member Management
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Metrics Management
  const [metricUserSearch, setMetricUserSearch] = useState('');
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);

  // AI Management
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');

  useEffect(() => {
    if (selectedMetricUser) {
      const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
      Database.getMetrics(uid).then(m => setUserMetrics(m || []));
    } else {
      setUserMetrics([]);
    }
  }, [selectedMetricUser]);

  const handleDeleteUser = async (id: string, name: string) => {
    const currentId = (currentUser as any).id || (currentUser as any)._id;
    if (id === currentId) return alert("Không thể tự xóa chính mình!");
    if (confirm(`⚠️ Xóa vĩnh viễn hội viên "${name}"?`)) {
      await Database.deleteUser(id);
      onRefresh();
    }
  };

  const handleDeleteMetric = async (id: string) => {
    if (confirm('Xóa bản ghi chỉ số này?')) {
      await Database.deleteMetric(id);
      if (selectedMetricUser) {
        const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
        Database.getMetrics(uid).then(m => setUserMetrics(m || []));
      }
    }
  };

  const handleTestAI = async () => {
    if (!testInput.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), senderId: 'tester', senderName: 'Admin', senderRole: UserRole.ADMIN, content: testInput, timestamp: new Date().toISOString() };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setIsTestTyping(true);
    const response = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, userMsg.content, HealthGoal.BODY_RECOMP);
    setIsTestTyping(false);
    if (response) {
      setTestMessages(prev => [...prev, { id: Date.now().toString(), senderId: 'ai', senderName: 'Lucky AI', senderRole: 'AI' as any, content: response, timestamp: new Date().toISOString() }]);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[75vh] flex flex-col">
      {/* Tab Navigation */}
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar shrink-0">
        <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
        <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Quản lý Chỉ số</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
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
                        <button onClick={() => handleDeleteUser(((u as any).id || (u as any)._id)!, u.fullName)} className="text-rose-400 font-black text-[9px] hover:underline">Xóa</button>
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
              <input placeholder="Họ tên hoặc SĐT..." value={metricUserSearch} onChange={e => setMetricUserSearch(e.target.value)} className="w-full px-5 py-3 bg-white rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm font-medium" />
              <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-2">
                {users.filter(u => u.fullName.toLowerCase().includes(metricUserSearch.toLowerCase())).map(u => (
                  <div key={(u as any).id || (u as any)._id} onClick={() => setSelectedMetricUser(u)} className={`p-4 rounded-2xl border cursor-pointer transition-all ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}>
                    <div className="font-bold text-[12px]">{u.fullName}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-9 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
              {selectedMetricUser ? (
                <div className="overflow-x-auto no-scrollbar">
                  {/* BẢNG CHỈ SỐ ĐẦY ĐỦ CHO ADMIN */}
                  <table className="w-full text-[11px] text-left min-w-[800px]">
                    <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                      <tr>
                        <th className="p-3">Ngày</th>
                        <th className="p-3">Cân (kg)</th>
                        <th className="p-3">Mỡ %</th>
                        <th className="p-3">Cơ (kg)</th>
                        <th className="p-3">Xương (kg)</th>
                        <th className="p-3">Nước %</th>
                        <th className="p-3">Mỡ NT</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {userMetrics.map(m => (
                        <tr key={(m as any).id || (m as any)._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-bold">{new Date(m.date).toLocaleDateString('vi-VN')}</td>
                          <td className="p-3 font-black text-emerald-600">{m.weight}</td>
                          <td className="p-3 font-bold text-rose-500">{m.bodyFat}%</td>
                          <td className="p-3 font-bold text-blue-600">{m.muscleMass}</td>
                          <td className="p-3 text-slate-500">{m.boneMinerals || '--'}</td>
                          <td className="p-3 text-sky-600">{m.waterPercent || '--'}%</td>
                          <td className="p-3 font-bold text-amber-600">{m.visceralFat || '--'}</td>
                          <td className="p-3 text-right space-x-2">
                            <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black text-[9px] hover:underline">SỬA</button>
                            <button onClick={() => handleDeleteMetric(((m as any).id || (m as any)._id)!)} className="text-red-400 font-black text-[9px] hover:underline">XÓA</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 p-20 text-center uppercase text-[10px] font-black tracking-widest">Chọn một hội viên để xem và quản lý chỉ số chi tiết</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-300 flex flex-col min-h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
                  <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[10px]">Cập nhật Kiến thức (Knowledge)</h4>
                  <input placeholder="Từ khóa (VD: Keto, Whey...)" value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm border-none outline-none focus:ring-1 focus:ring-emerald-500" />
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
              <div className="space-y-6 flex flex-col min-h-0">
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 flex-grow flex flex-col min-h-0">
                  <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] mb-4">Danh sách Kiến thức</h4>
                  <div className="overflow-y-auto space-y-2 no-scrollbar flex-grow">
                    {knowledge.map(k => (
                      <div key={k.id} className="p-3 bg-slate-50 rounded-2xl flex justify-between items-center group border border-transparent hover:border-emerald-200">
                        <div className="min-w-0 pr-4">
                          <div className="font-black text-[10px] text-emerald-600 uppercase tracking-tighter truncate">{k.keyword}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{k.content}</div>
                        </div>
                        <button onClick={() => Database.deleteKnowledge(k.id).then(onRefresh)} className="text-rose-400 hover:text-rose-600 font-black text-lg p-2 transition-colors">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Terminal View AI Console - LOG NHỎ GỌN */}
            <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[300px] flex flex-col border-4 border-slate-800 shrink-0">
              <div className="mb-3 border-b border-emerald-900/50 pb-2 text-[9px] font-black uppercase tracking-widest opacity-60 flex justify-between">
                <span>> Lucky AI Sandbox Console</span>
                <button onClick={() => setTestMessages([])} className="text-emerald-700 hover:text-emerald-400 transition-colors">CLEAR</button>
              </div>
              <div className="flex-grow overflow-y-auto space-y-2 no-scrollbar mb-4">
                {testMessages.length === 0 && <div className="text-emerald-900/30 italic opacity-40">// Chế độ Sandbox. Nhập câu hỏi để thử nghiệm phản hồi...</div>}
                {testMessages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
                    <span className="opacity-40">[{m.senderName}]:</span>
                    <span>{m.content}</span>
                  </div>
                ))}
                {isTestTyping && <div className="animate-pulse text-emerald-600">> AI đang gõ...</div>}
              </div>
              <div className="flex gap-2 p-1 bg-emerald-950/20 rounded-xl border border-emerald-900/30">
                <span className="pl-3 py-2 text-emerald-600 font-black">></span>
                <input placeholder="Nhập câu hỏi test AI..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestAI()} className="flex-grow bg-transparent border-none px-2 py-2 text-emerald-400 outline-none placeholder:text-emerald-900/30" />
                <button onClick={handleTestAI} className="bg-emerald-800 text-emerald-300 px-4 rounded-lg font-black text-[9px] uppercase">Execute</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Sửa Chỉ số - ĐẦY ĐỦ TRƯỜNG DỮ LIỆU */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={async (e) => { e.preventDefault(); const mid = (editingMetric as any).id || (editingMetric as any)._id; await Database.updateMetric(mid, editingMetric); setEditingMetric(null); if (selectedMetricUser) { const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id; Database.getMetrics(uid).then(m => setUserMetrics(m || [])); } }} className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4"><h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Sửa chỉ số đo lường</h4><button type="button" onClick={() => setEditingMetric(null)} className="text-slate-400 text-2xl">×</button></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Ngày đo</label><input type="date" value={editingMetric.date} onChange={e => setEditingMetric({...editingMetric, date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none font-bold text-xs" /></div>
              {[
                {k: 'weight', l: 'Cân nặng'}, {k: 'bodyFat', l: 'Tỉ lệ mỡ'}, {k: 'muscleMass', l: 'Cơ bắp'},
                {k: 'boneMinerals', l: 'Khối xương'}, {k: 'waterPercent', l: 'Nước'}, {k: 'visceralFat', l: 'Mỡ nội tạng'},
                {k: 'energy', l: 'BMR (kcal)'}, {k: 'bioAge', l: 'Tuổi SH'}
              ].map(f => (
                <div key={f.k} className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">{f.l}</label><input type="number" step="0.1" value={(editingMetric as any)[f.k]} onChange={e => setEditingMetric({...editingMetric, [f.k]: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none font-bold text-xs" /></div>
              ))}
            </div>
            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px]">Hủy</button><button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px]">Cập nhật</button></div>
          </form>
        </div>
      )}

      {/* Modal Sửa Hội viên */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4">
          <form onSubmit={async (e) => { e.preventDefault(); await Database.updateUser((editingUser as any).id || (editingUser as any)._id, editingUser); setEditingUser(null); onRefresh(); }} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4"><h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật Hội viên</h4><button type="button" onClick={() => setEditingUser(null)} className="text-2xl text-slate-400">&times;</button></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Họ và tên</label><input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 font-bold text-xs" /></div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Vai trò</label><select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl outline-none font-bold text-xs">{Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}</select></div>
            </div>
            <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Trạng thái</label><select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 font-bold text-xs">{Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px]">Hủy</button><button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
