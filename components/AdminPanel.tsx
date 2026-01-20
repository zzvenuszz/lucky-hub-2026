
import React, { useState } from 'react';
import { User, UserRole, AccountStatus, AIKnowledge } from '../types.ts';
import { Database } from '../services/database.ts';

interface AdminPanelProps {
  users: User[];
  knowledge: AIKnowledge[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ users, knowledge, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'ai'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newK.keyword || !newK.content) return;
    setIsSubmitting(true);
    try {
      await Database.addKnowledge(newK);
      setNewK({ keyword: '', content: '' });
      onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (confirm('Xóa kiến thức này khỏi não bộ AI?')) {
      await Database.deleteKnowledge(id);
      onRefresh();
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredKnowledge = knowledge.filter(k => 
    k.keyword.toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[70vh]">
      <div className="flex bg-slate-50/50 p-2 m-6 rounded-2xl border border-slate-100">
        <button onClick={() => { setActiveTab('users'); setSearchTerm(''); }} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Quản lý Người dùng</button>
        <button onClick={() => { setActiveTab('ai'); setSearchTerm(''); }} className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400'}`}>Huấn luyện Lucky AI</button>
      </div>

      <div className="px-8 pb-8">
        <div className="mb-6">
          <div className="relative">
            <input 
              placeholder={activeTab === 'users' ? "Tìm kiếm hội viên theo tên hoặc username..." : "Tìm kiếm từ khóa kiến thức..."}
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm transition-all"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300">🔍</span>
          </div>
        </div>

        {activeTab === 'users' ? (
          <div className="overflow-x-auto">
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 sticky top-6">
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="text-xl">🧠</span> Thêm tri thức mới
                </h3>
                <form onSubmit={handleAddKnowledge} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Từ khóa (VD: Giảm cân, Keto...)</label>
                    <input 
                      required placeholder="Nhập từ khóa..." 
                      value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} 
                      className="w-full px-4 py-3 rounded-xl bg-white border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nội dung tư vấn chi tiết</label>
                    <textarea 
                      required placeholder="Lucky AI sẽ trả lời dựa trên nội dung này..." rows={5} 
                      value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} 
                      className="w-full px-4 py-3 rounded-xl bg-white border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium resize-none" 
                    />
                  </div>
                  <button 
                    disabled={isSubmitting} type="submit"
                    className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Đang lưu...' : 'Nạp vào não bộ AI'}
                  </button>
                </form>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-2 px-2">
                <h3 className="font-black text-slate-400 text-[10px] uppercase tracking-[0.2em]">Kho tri thức hiện tại ({filteredKnowledge.length})</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {filteredKnowledge.length > 0 ? filteredKnowledge.map(k => (
                  <div key={k.id} className="p-5 border border-slate-100 rounded-3xl bg-white hover:border-emerald-200 transition-all group relative">
                    <div className="flex items-start justify-between mb-2">
                      <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100">#{k.keyword}</div>
                      <button onClick={() => handleDeleteKnowledge(k.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all text-xl">×</button>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">{k.content}</p>
                  </div>
                )) : (
                  <div className="py-20 text-center text-slate-300 italic font-medium">Chưa có kiến thức nào phù hợp</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
