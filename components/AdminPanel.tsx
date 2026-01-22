
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
  
  // States cho tab Quản lý Chỉ số
  const [metricUserSearch, setMetricUserSearch] = useState('');
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);

  // AI Sandbox States
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [testImage, setTestImage] = useState<string | null>(null);
  const [isTestTyping, setIsTestTyping] = useState(false);
  
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');

  // Tải chỉ số khi chọn người dùng
  useEffect(() => {
    if (selectedMetricUser) {
      const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
      Database.getMetrics(uid).then(m => setUserMetrics(m || []));
    } else {
      setUserMetrics([]);
    }
  }, [selectedMetricUser]);

  const handleTestChat = async () => {
    if (!testInput.trim() && !testImage) return;
    const base64Data = testImage ? testImage.split(',')[1] : undefined;
    const userMsg: Message = {
      id: `test_${Date.now()}`, senderId: 'admin_test', senderName: currentUser.fullName, senderRole: UserRole.ADMIN,
      content: testInput || (testImage ? "[Gửi ảnh kiểm thử]" : ""), imageUrl: testImage || undefined, timestamp: new Date().toISOString()
    };
    setTestMessages(prev => [...prev, userMsg]);
    const sentInput = testInput; setTestInput(''); setTestImage(null); setIsTestTyping(true);
    try {
      const aiResponse = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, sentInput || "Phân tích hồ sơ tôi", currentUser.healthGoal, undefined, base64Data);
      if (aiResponse) setTestMessages(prev => [...prev, { id: `ai_${Date.now()}`, senderId: 'ai_coach', senderName: 'Lucky AI', senderRole: 'AI' as any, content: aiResponse, timestamp: new Date().toISOString() }]);
    } finally { setIsTestTyping(false); }
  };

  const handleDeleteKnowledge = async (k: AIKnowledge) => {
    if (confirm(`Bạn có chắc chắn muốn xóa tri thức về từ khóa "${k.keyword}" không?`)) {
      const id = k.id || (k as any)._id;
      if (id) {
        await Database.deleteKnowledge(id);
        onRefresh();
      }
    }
  };

  const handleDeleteRule = async (r: AIRule) => {
    if (confirm(`Bạn có chắc chắn muốn xóa quy chuẩn: "${r.content}" không?`)) {
      const id = r.id || (r as any)._id;
      if (id) {
        await Database.deleteRule(id);
        onRefresh();
      }
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (confirm(`⚠️ CẢNH BÁO: Bạn đang xóa vĩnh viễn tài khoản "${name}". Tiếp tục?`)) {
      await Database.deleteUser(id);
      onRefresh();
    }
  };

  const handleToggleStatus = async (user: User) => {
    const id = (user as any).id || (user as any)._id;
    const nextStatus = user.status === AccountStatus.ACTIVE ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    await Database.updateUser(id, { status: nextStatus });
    onRefresh();
  };

  const handlePermissionToggle = async (user: User, perm: Permission) => {
    const id = (user as any).id || (user as any)._id;
    const perms = user.permissions || [];
    const nextPerms = perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm];
    await Database.updateUser(id, { permissions: nextPerms });
    onRefresh();
  };

  const handleDeleteMetric = async (id: string) => {
    if (confirm('Xóa chỉ số này?')) {
      await Database.deleteMetric(id);
      if (selectedMetricUser) {
        const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
        Database.getMetrics(uid).then(m => setUserMetrics(m || []));
      }
    }
  };

  const filteredUsersForMetrics = users.filter(u => 
    u.fullName.toLowerCase().includes(metricUserSearch.toLowerCase()) || 
    u.phoneNumber?.includes(metricUserSearch)
  );

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
              <input placeholder="Tìm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-grow px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-50">
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Hội viên</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Quyền hạn</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.filter(u => u.fullName.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                    <tr key={(u as any).id || (u as any)._id} className="group hover:bg-slate-50/20">
                      <td className="py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                          <div><div className="font-bold text-slate-800">{u.fullName}</div><div className="text-[10px] text-slate-400 tracking-tighter">{u.role}</div></div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[250px]">
                          {Object.values(Permission).map(p => (
                            <button key={p} onClick={() => handlePermissionToggle(u, p)} className={`text-[8px] px-2 py-0.5 rounded font-black transition-all ${u.permissions?.includes(p) ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                              {p.replace('MANAGE_', '').replace('DELETE_', '❌')}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="text-right space-x-3">
                        <button onClick={() => handleToggleStatus(u)} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status === AccountStatus.ACTIVE ? 'Đang hoạt động' : 'Đã khóa'}</button>
                        <button onClick={() => handleDeleteUser(((u as any).id || (u as any)._id)!, u.fullName)} className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors uppercase">Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : activeTab === 'metrics' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Cột trái: Tìm kiếm hội viên */}
              <div className="bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">🔍 Tìm kiếm hội viên</h3>
                  {selectedMetricUser && (
                    <button onClick={() => setSelectedMetricUser(null)} className="text-[9px] font-black text-rose-500 uppercase">Hủy chọn</button>
                  )}
                </div>
                <input 
                  placeholder="Nhập tên hoặc số điện thoại..." 
                  value={metricUserSearch} 
                  onChange={e => setMetricUserSearch(e.target.value)} 
                  className="w-full px-5 py-3 bg-white rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm font-medium" 
                />
                <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-2">
                  {filteredUsersForMetrics.map(u => (
                    <div 
                      key={(u as any).id || (u as any)._id} 
                      onClick={() => setSelectedMetricUser(u)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-[10px] ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}>{u.fullName.charAt(0)}</div>
                        <div>
                          <div className="font-bold text-[11px] leading-none">{u.fullName}</div>
                          <div className={`text-[9px] mt-1 font-medium ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'text-white/70' : 'text-slate-400'}`}>{u.phoneNumber || 'Không có SĐT'}</div>
                        </div>
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'text-white' : 'text-slate-300'}`}>Chọn →</span>
                    </div>
                  ))}
                  {filteredUsersForMetrics.length === 0 && <div className="text-center py-8 text-slate-400 text-xs italic">Không tìm thấy hội viên phù hợp</div>}
                </div>
              </div>

              {/* Cột phải: Lịch sử chỉ số */}
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 space-y-4 h-full flex flex-col min-h-[440px]">
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">📈 Lịch sử đo lường</h3>
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                    {selectedMetricUser ? selectedMetricUser.fullName : 'Chưa chọn hội viên'}
                  </span>
                </div>
                
                {!selectedMetricUser ? (
                  <div className="flex-grow flex flex-col items-center justify-center text-slate-300 space-y-4">
                    <div className="text-4xl">📊</div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-center">Hãy chọn một hội viên bên trái<br/>để xem và quản lý chỉ số</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar flex-grow">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-50 text-slate-400 font-black uppercase sticky top-0 z-10">
                        <tr>
                          <th className="p-3">Ngày đo</th>
                          <th className="p-3 text-center">Cân (kg)</th>
                          <th className="p-3 text-center">Mỡ (%)</th>
                          <th className="p-3 text-right">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {userMetrics.map(m => (
                          <tr key={(m as any).id || (m as any)._id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-700">{m.date}</td>
                            <td className="p-3 text-center font-black text-emerald-600">{m.weight}</td>
                            <td className="p-3 text-center text-rose-500 font-bold">{m.bodyFat}%</td>
                            <td className="p-3 text-right space-x-3">
                              <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black hover:underline uppercase text-[9px]">Sửa</button>
                              <button onClick={() => handleDeleteMetric(((m as any).id || (m as any)._id)!)} className="text-red-400 font-black hover:underline uppercase text-[9px]">Xóa</button>
                            </td>
                          </tr>
                        ))}
                        {userMetrics.length === 0 && (
                          <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Hội viên này chưa có dữ liệu đo</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QUY CHUẨN AI */}
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-col h-[600px] shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 shrink-0">⚖️ Quy chuẩn AI</h3>
                <form onSubmit={e => { e.preventDefault(); Database.addRule({content: newRule}).then(() => {setNewRule(''); onRefresh();}); }} className="flex gap-2 mb-4 shrink-0">
                  <input placeholder="Thêm quy tắc mới..." value={newRule} onChange={e => setNewRule(e.target.value)} className="flex-grow px-4 py-2.5 bg-white rounded-xl text-xs outline-none shadow-sm font-medium" />
                  <button type="submit" className="bg-emerald-600 text-white w-10 h-10 rounded-xl font-bold flex items-center justify-center transition-transform active:scale-90">+</button>
                </form>
                <div className="space-y-2 overflow-y-auto no-scrollbar flex-grow pr-1">
                  {rules.map(r => (
                    <div key={(r as any).id || (r as any)._id} className="flex items-start justify-between p-4 bg-white rounded-2xl text-[10px] border border-slate-100 group shadow-sm">
                      <span className="leading-relaxed text-slate-700 font-medium">"{r.content}"</span>
                      <button onClick={() => handleDeleteRule(r)} className="text-slate-300 hover:text-red-500 ml-2 transition-colors p-1">×</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* NẠP TRI THỨC */}
              <div className="bg-emerald-50/20 p-6 rounded-[2rem] border border-emerald-100 flex flex-col h-[600px] shadow-sm">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest mb-4 shrink-0">🧠 Nạp tri thức</h3>
                <form onSubmit={e => { e.preventDefault(); Database.addKnowledge(newK).then(() => {setNewK({keyword:'', content:''}); onRefresh();}); }} className="space-y-3 mb-6 shrink-0">
                  <input required placeholder="Từ khóa liên quan..." value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white text-xs outline-none shadow-sm border border-emerald-50 font-medium" />
                  <textarea required placeholder="Nội dung tri thức cho AI..." rows={2} value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-white text-xs outline-none shadow-sm border border-emerald-50 font-medium" />
                  <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-100 transition-all active:scale-95">Nạp tri thức</button>
                </form>
                <div className="space-y-3 overflow-y-auto no-scrollbar flex-grow pr-1">
                  {knowledge.map(k => (
                    <div key={(k as any).id || (k as any)._id} className="p-4 bg-white rounded-2xl border border-emerald-100/50 shadow-sm relative group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">KEY: {k.keyword}</span>
                        <button onClick={() => handleDeleteKnowledge(k)} className="text-slate-300 hover:text-red-500 transition-colors p-1 text-base leading-none">×</button>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed italic line-clamp-4 group-hover:line-clamp-none transition-all">"{k.content}"</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Sandbox & Logs */}
            <div className="lg:col-span-4 flex flex-col gap-6 h-[600px]">
              <div className="flex flex-col h-[600px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-800">
                <div className="p-4 bg-slate-800/80 flex items-center justify-between shrink-0 backdrop-blur-md">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Advisor Sandbox</span>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                </div>
                <div className="flex-grow p-5 overflow-y-auto space-y-4 no-scrollbar bg-slate-900/50">
                  {testMessages.length === 0 && (
                    <div className="h-full flex items-center justify-center text-slate-600 text-[10px] italic text-center px-4 leading-relaxed uppercase tracking-widest font-bold">Thử nghiệm phản hồi AI tại đây</div>
                  )}
                  {testMessages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.senderId === 'admin_test' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] p-3.5 rounded-2xl text-[11px] leading-relaxed ${msg.senderId === 'admin_test' ? 'bg-emerald-600 text-white rounded-tr-none shadow-lg' : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-700'}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTestTyping && <div className="text-[10px] text-emerald-500 animate-pulse font-black px-2 uppercase tracking-widest">AI đang suy nghĩ...</div>}
                </div>
                <div className="p-4 bg-slate-800/80 backdrop-blur-md shrink-0 border-t border-slate-700">
                  <div className="flex gap-2">
                    <input placeholder="Hỏi thử AI..." value={testInput} onChange={e => setTestInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTestChat()} className="flex-grow bg-slate-700 rounded-xl px-4 py-2.5 text-xs text-white outline-none border border-slate-600 focus:border-emerald-500" />
                    <button onClick={handleTestChat} className="bg-emerald-600 text-white w-10 h-10 rounded-xl font-bold flex items-center justify-center transition-transform active:scale-90 shadow-lg shadow-emerald-900/20">🚀</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <form 
            onSubmit={async (e) => { 
              e.preventDefault(); 
              const mid = (editingMetric as any).id || (editingMetric as any)._id;
              await Database.updateMetric(mid, editingMetric); 
              setEditingMetric(null); 
              if (selectedMetricUser) {
                const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
                Database.getMetrics(uid).then(m => setUserMetrics(m || []));
              }
            }} 
            className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <h4 className="font-black text-slate-800 uppercase tracking-widest">Cập nhật chỉ số toàn diện</h4>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Hội viên: {selectedMetricUser?.fullName}</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày đo</label>
                <input type="date" value={editingMetric.date} onChange={e => setEditingMetric({...editingMetric, date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" />
              </div>
              {[
                { key: 'weight', label: 'Cân nặng (kg)' },
                { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)' },
                { key: 'muscleMass', label: 'Khối cơ (kg)' },
                { key: 'boneMinerals', label: 'Khối xương (kg)' },
                { key: 'waterPercent', label: 'Lượng nước (%)' },
                { key: 'visceralFat', label: 'Mỡ nội tạng (Lv)' },
                { key: 'energy', label: 'BMR (kcal)' },
                { key: 'balanceIndex', label: 'Chỉ số cân đối' },
                { key: 'bioAge', label: 'Tuổi sinh học' },
              ].map(field => (
                <div key={field.key} className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{field.label}</label>
                  <input 
                    type="number" step="0.1" 
                    value={(editingMetric as any)[field.key]} 
                    onChange={e => setEditingMetric({...editingMetric, [field.key]: Number(e.target.value)})} 
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" 
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-colors">Hủy bỏ</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95">Lưu thay đổi</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
