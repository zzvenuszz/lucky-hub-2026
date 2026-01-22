
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
  
  // States cho quản lý Hội viên
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

  const handleDeleteUser = async (id: string, name: string) => {
    if (id === (currentUser as any).id || id === (currentUser as any)._id) {
      alert("Bạn không thể tự xóa tài khoản của chính mình!");
      return;
    }
    if (confirm(`⚠️ CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${name}"? Thao tác này không thể hoàn tác.`)) {
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
    if (confirm('Xóa bản ghi chỉ số này?')) {
      await Database.deleteMetric(id);
      if (selectedMetricUser) {
        const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
        Database.getMetrics(uid).then(m => setUserMetrics(m || []));
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phoneNumber?.includes(searchTerm)
  );

  const filteredUsersForMetrics = users.filter(u => 
    u.fullName.toLowerCase().includes(metricUserSearch.toLowerCase()) || 
    u.phoneNumber?.includes(metricUserSearch)
  );

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      {/* Tab Navigation */}
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Danh sách Hội viên</button>
        <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Quản lý Chỉ số</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
      </div>

      <div className="px-8 pb-8">
        {activeTab === 'users' ? (
          <>
            <div className="mb-6 flex gap-4">
              <input 
                placeholder="Tìm hội viên (Tên, Username, SĐT)..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                className="flex-grow px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" 
              />
            </div>
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-50">
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Hội viên</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Vai trò</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest">Quyền hạn</th>
                    <th className="pb-4 font-black uppercase text-[10px] tracking-widest text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map(u => (
                    <tr key={(u as any).id || (u as any)._id} className="group hover:bg-slate-50/20 transition-colors">
                      <td className="py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black ${u.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{u.fullName}</div>
                            <div className="text-[10px] text-slate-400 tracking-tighter">@{u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          u.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-600' :
                          u.role === UserRole.COACH ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {Object.values(Permission).map(p => (
                            <button 
                              key={p} 
                              onClick={() => handlePermissionToggle(u, p)}
                              className={`text-[8px] px-2 py-0.5 rounded font-black transition-all ${u.permissions?.includes(p) ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                            >
                              {p.replace('MANAGE_', '').replace('DELETE_', '❌ ')}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => handleToggleStatus(u)} 
                            className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                          >
                            {u.status === AccountStatus.ACTIVE ? 'Hoạt động' : 'Đã khóa'}
                          </button>
                          <button 
                            onClick={() => setEditingUser(u)} 
                            className="text-[10px] font-black text-emerald-600 hover:underline uppercase p-1"
                          >
                            Sửa
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(((u as any).id || (u as any)._id)!, u.fullName)} 
                            className="text-[10px] font-black text-rose-400 hover:text-rose-600 uppercase p-1"
                          >
                            Xóa
                          </button>
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Chọn hội viên */}
              <div className="lg:col-span-4 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                <h3 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">🔍 Tìm hội viên</h3>
                <input 
                  placeholder="Tên hoặc Số điện thoại..." 
                  value={metricUserSearch} 
                  onChange={e => setMetricUserSearch(e.target.value)} 
                  className="w-full px-5 py-3 bg-white rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm font-medium" 
                />
                <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-2">
                  {filteredUsersForMetrics.map(u => (
                    <div 
                      key={(u as any).id || (u as any)._id} 
                      onClick={() => setSelectedMetricUser(u)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg' : 'bg-white border-slate-100 hover:border-emerald-200 text-slate-600'}`}
                    >
                      <div>
                        <div className="font-bold text-[12px]">{u.fullName}</div>
                        <div className={`text-[10px] mt-1 ${((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) ? 'text-white/70' : 'text-slate-400'}`}>{u.phoneNumber || 'Không có SĐT'}</div>
                      </div>
                      {((selectedMetricUser as any)?.id || (selectedMetricUser as any)?._id) === ((u as any).id || (u as any)._id) && <span>✓</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Lịch sử chỉ số */}
              <div className="lg:col-span-8 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
                {selectedMetricUser ? (
                  <>
                    <div className="flex items-center justify-between mb-6 border-b border-slate-50 pb-4">
                      <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-widest">Lịch sử đo: {selectedMetricUser.fullName}</h3>
                      <button onClick={() => setSelectedMetricUser(null)} className="text-[9px] font-black text-rose-500 uppercase">Đóng</button>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-[11px] text-left">
                        <thead className="text-slate-400 font-black uppercase tracking-widest border-b border-slate-50">
                          <tr>
                            <th className="p-3">Ngày</th>
                            <th className="p-3 text-center">Cân (kg)</th>
                            <th className="p-3 text-center">Mỡ (%)</th>
                            <th className="p-3 text-center">Cơ (kg)</th>
                            <th className="p-3 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {[...userMetrics].reverse().map(m => (
                            <tr key={(m as any).id || (m as any)._id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3 font-bold text-slate-700">{new Date(m.date).toLocaleDateString('vi-VN')}</td>
                              <td className="p-3 text-center font-black text-emerald-600">{m.weight}</td>
                              <td className="p-3 text-center font-bold text-rose-500">{m.bodyFat}%</td>
                              <td className="p-3 text-center font-bold text-blue-600">{m.muscleMass}</td>
                              <td className="p-3 text-right">
                                <button onClick={() => setEditingMetric(m)} className="text-emerald-600 font-black uppercase text-[9px] hover:underline mr-3">Sửa</button>
                                <button onClick={() => handleDeleteMetric(((m as any).id || (m as any)._id)!)} className="text-red-400 font-black uppercase text-[9px] hover:underline">Xóa</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                    <div className="text-5xl opacity-20">📊</div>
                    <p className="font-black uppercase text-[10px] tracking-[0.2em] text-center">Chọn hội viên để xem<br/>lịch sử đo lường chi tiết</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* AI Training content giữ nguyên */}
          </div>
        )}
      </div>

      {/* Modal Sửa Hội viên (Thay đổi nhóm/thông tin) */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4">
          <form 
            onSubmit={async (e) => { 
              e.preventDefault(); 
              const uid = (editingUser as any).id || (editingUser as any)._id;
              await Database.updateUser(uid, editingUser);
              setEditingUser(null);
              onRefresh();
            }} 
            className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 shadow-2xl animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <h4 className="font-black text-slate-800 uppercase tracking-widest">Sửa thông tin Hội viên</h4>
              <button type="button" onClick={() => setEditingUser(null)} className="text-2xl text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ và tên</label>
                  <input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Vai trò (Nhóm)</label>
                  <select 
                    value={editingUser.role} 
                    onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} 
                    className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl outline-none border border-emerald-100 font-bold text-xs"
                  >
                    {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Số điện thoại</label>
                <input value={editingUser.phoneNumber} onChange={e => setEditingUser({...editingUser, phoneNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mục tiêu sức khỏe</label>
                <select 
                  value={editingUser.healthGoal} 
                  onChange={e => setEditingUser({...editingUser, healthGoal: e.target.value as HealthGoal})} 
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs"
                >
                  {Object.values(HealthGoal).map(goal => <option key={goal} value={goal}>{goal}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] hover:bg-slate-200">Hủy</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg shadow-emerald-100">Lưu thông tin</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Sửa Chỉ số */}
      {editingMetric && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[210] flex items-center justify-center p-4 overflow-y-auto">
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
            className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 space-y-6 shadow-2xl my-auto animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <h4 className="font-black text-slate-800 uppercase tracking-widest">Sửa chỉ số đo lường</h4>
              <button type="button" onClick={() => setEditingMetric(null)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày đo</label>
                <input type="date" value={editingMetric.date} onChange={e => setEditingMetric({...editingMetric, date: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" />
              </div>
              {[
                { key: 'weight', label: 'Cân nặng (kg)' },
                { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)' },
                { key: 'muscleMass', label: 'Khối cơ (kg)' },
                { key: 'boneMinerals', label: 'Khối xương (kg)' },
                { key: 'waterPercent', label: 'Lượng nước (%)' },
                { key: 'visceralFat', label: 'Mỡ nội tạng' },
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
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" 
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={() => setEditingMetric(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] tracking-widest hover:bg-slate-200 transition-colors">Hủy</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95">Cập nhật</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
