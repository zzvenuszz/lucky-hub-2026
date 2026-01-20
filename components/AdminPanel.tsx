
import React, { useState } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge } from '../types';
import { Database } from '../services/database';

interface AdminPanelProps {
  users: User[];
  knowledge: AIKnowledge[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ users, knowledge, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [newK, setNewK] = useState({ keyword: '', content: '' });

  const handleResetPassword = async (id: string) => {
    const res = await Database.resetPassword(id);
    if (res) alert(`Đã reset mật khẩu mới: ${res.newPassword}`);
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

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex bg-slate-50 p-2 m-4 rounded-2xl">
        <button onClick={() => setActiveTab('users')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Người dùng</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Training AI</button>
      </div>

      <div className="p-6">
        {activeTab === 'users' ? (
          <div className="space-y-4">
            <input 
              placeholder="Tìm kiếm hội viên..." 
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="pb-3">Tên</th><th className="pb-3">Vai trò</th><th className="pb-3">Trạng thái</th><th className="pb-3 text-right">Thao tác</th>
                </tr></thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-4">
                        <div className="font-bold">{u.fullName}</div>
                        <div className="text-xs text-slate-400">@{u.username}</div>
                      </td>
                      <td>
                        <select 
                          value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="text-xs bg-slate-100 border-none rounded-lg p-1"
                        >
                          <option value={UserRole.MEMBER}>Hội viên</option>
                          <option value={UserRole.COACH}>Huấn luyện viên</option>
                          <option value={UserRole.ADMIN}>Quản trị viên</option>
                        </select>
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.status}</span>
                      </td>
                      <td className="text-right space-x-2">
                        <button onClick={() => handleToggleStatus(u)} className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">{u.status === AccountStatus.ACTIVE ? 'Khóa' : 'Mở'}</button>
                        <button onClick={() => handleResetPassword(u.id)} className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">Reset</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <h3 className="font-bold mb-4">Training cho Huấn luyện viên AI</h3>
              <div className="space-y-4">
                <input placeholder="Từ khóa (Keyword)" value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full p-2 rounded-lg border-none" />
                <textarea placeholder="Kiến thức tư vấn chi tiết..." rows={3} value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full p-2 rounded-lg border-none" />
                <button onClick={async () => { await Database.addKnowledge(newK); onRefresh(); setNewK({keyword:'', content:''}); }} className="w-full bg-emerald-600 text-white py-2 rounded-xl font-bold">Thêm kiến thức</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {knowledge.map(k => (
                <div key={k.id} className="p-4 border border-slate-100 rounded-2xl bg-white group relative">
                  <div className="text-emerald-600 font-bold text-sm mb-1">#{k.keyword}</div>
                  <p className="text-xs text-slate-500">{k.content}</p>
                  <button onClick={async () => { await Database.deleteKnowledge(k.id); onRefresh(); }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 transition-opacity">&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
