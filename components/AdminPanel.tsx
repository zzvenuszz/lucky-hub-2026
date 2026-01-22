
import React, { useState, useEffect } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge, AIRule, Message, HealthMetric, Permission, HealthGoal } from '../types.ts';
import { Database } from '../services/database.ts';

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
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedMetricUser, setSelectedMetricUser] = useState<User | null>(null);
  const [userMetrics, setUserMetrics] = useState<HealthMetric[]>([]);
  const [editingMetric, setEditingMetric] = useState<HealthMetric | null>(null);

  useEffect(() => {
    if (selectedMetricUser) {
      const uid = (selectedMetricUser as any).id || (selectedMetricUser as any)._id;
      Database.getMetrics(uid).then(m => setUserMetrics(m || []));
    }
  }, [selectedMetricUser]);

  const handleDeleteUser = async (user: User) => {
    const id = (user as any).id || (user as any)._id;
    const currentId = (currentUser as any).id || (currentUser as any)._id;
    if (id === currentId) return alert("Bạn không thể tự xóa tài khoản của mình!");
    if (confirm(`Bạn có chắc muốn xóa hội viên "${user.fullName}"? Mọi dữ liệu chỉ số sẽ mất vĩnh viễn.`)) {
      await Database.deleteUser(id);
      onRefresh();
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100 overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('users')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Hội viên</button>
        <button onClick={() => setActiveTab('metrics')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Chỉ số</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 min-w-[120px] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện AI</button>
      </div>

      <div className="px-8 pb-8">
        {activeTab === 'users' ? (
          <div className="space-y-6">
            <input placeholder="Tìm kiếm hội viên..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-50 font-black uppercase text-[10px] tracking-widest">
                    <th className="pb-4">Hội viên</th>
                    <th className="pb-4">Vai trò</th>
                    <th className="pb-4">Trạng thái</th>
                    <th className="pb-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map(u => (
                    <tr key={(u as any).id || (u as any)._id} className="group hover:bg-slate-50/20">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{u.fullName.charAt(0)}</div>
                          <div><div className="font-bold text-slate-800">{u.fullName}</div><div className="text-[10px] text-slate-400">@{u.username}</div></div>
                        </div>
                      </td>
                      <td className="py-4"><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${u.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{u.role}</span></td>
                      <td className="py-4"><span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{u.status}</span></td>
                      <td className="py-4 text-right space-x-2">
                        <button onClick={() => setEditingUser(u)} className="text-emerald-600 font-black uppercase text-[9px] hover:underline">Sửa</button>
                        <button onClick={() => handleDeleteUser(u)} className="text-rose-400 font-black uppercase text-[9px] hover:underline">Xóa</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'metrics' ? (
          <div className="space-y-6">
            <h3 className="font-black text-slate-800 uppercase tracking-widest text-[11px]">Quản lý chỉ số đo lường</h3>
            {/* Logic quản lý chỉ số tương tự... */}
          </div>
        ) : null}
      </div>

      {/* Modal Sửa Hội viên */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Họ và tên</label>
                <input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 focus:border-emerald-500 font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Vai trò (Nhóm)</label>
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
              <label className="text-[10px] font-black text-slate-400 uppercase">Trạng thái</label>
              <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none border border-slate-100 font-bold text-xs">
                {Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-[11px] hover:bg-slate-200">Hủy</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg shadow-emerald-100">Lưu thay đổi</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
