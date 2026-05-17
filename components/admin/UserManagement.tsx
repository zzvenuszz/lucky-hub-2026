
import React, { useState, memo, useCallback } from 'react';
import { User, UserRole, AccountStatus } from '../../types.ts';
import { Database } from '../../services/database.ts';

interface UserManagementProps {
  users: User[];
  onRefresh: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Lấy userId an toàn
  const getUserId = useCallback((u: any): string => u.id || u._id, []);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const uid = getUserId(editingUser);
    await Database.updateUser(uid, editingUser);
    setEditingUser(null);
    onRefresh();
  };

  // Gửi email khôi phục mật khẩu cho người dùng
  const handleSendResetEmail = async (user: User) => {
    const uid = getUserId(user);
    setSendingEmail(uid);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/users/${uid}/send-reset-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName: 'Admin' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `📧 Email khôi phục đã gửi đến ${user.email}` });
        console.log(`[UserManagement] Reset email sent to ${user.email}`);
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Không thể gửi email' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
      console.error(`[UserManagement] Send reset email error:`, err);
    } finally {
      setSendingEmail(null);
    }
  };

  // Xóa người dùng
  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const uid = getUserId(deletingUser);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorName: 'Admin' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ type: 'success', text: `🗑️ Đã xóa người dùng ${deletingUser.fullName}` });
        console.log(`[UserManagement] Deleted user ${deletingUser.username}`);
      } else {
        setActionMessage({ type: 'error', text: data.message || 'Không thể xóa người dùng' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'Lỗi kết nối: ' + err.message });
      console.error(`[UserManagement] Delete user error:`, err);
    } finally {
      setDeletingUser(null);
      onRefresh();
    }
  };

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row gap-4">
        <input 
          placeholder="Tìm hội viên..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="flex-1 px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner font-medium" 
        />
      </div>
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
          {filteredUsers.map(u => (
            <tr key={(u as any).id || (u as any)._id} className="group hover:bg-slate-50/20">
              <td className="py-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  {u.fullName.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{u.fullName}</div>
                  <div className="text-[10px] text-slate-400">@{u.username}</div>
                </div>
              </td>
              <td><span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase">{u.role}</span></td>
              <td>
                <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${u.status === AccountStatus.ACTIVE ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {u.status}
                </span>
              </td>
              <td className="text-right space-x-2">
                <button 
                  onClick={() => setEditingUser(u)} 
                  className="text-emerald-600 font-black text-[9px] hover:underline"
                >
                  Sửa
                </button>
                <button 
                  onClick={() => handleSendResetEmail(u)} 
                  disabled={sendingEmail === getUserId(u)}
                  className={`text-amber-600 font-black text-[9px] hover:underline ${sendingEmail === getUserId(u) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {sendingEmail === getUserId(u) ? 'Đang gửi...' : 'Gửi email khôi phục'}
                </button>
                <button 
                  onClick={() => setDeletingUser(u)} 
                  className="text-rose-600 font-black text-[9px] hover:underline"
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Action Message Toast */}
      {actionMessage && (
        <div className={`fixed top-6 right-6 z-[1300] px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right font-bold text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {actionMessage.text}
          <button onClick={() => setActionMessage(null)} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 text-center">
            <div className="text-5xl mb-2">⚠️</div>
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Xác nhận xóa</h4>
            <p className="text-slate-600 text-sm leading-relaxed">
              Bạn có chắc chắn muốn xóa người dùng <strong>{deletingUser.fullName}</strong> (@{deletingUser.username})?
              <br />
              <span className="text-rose-500 text-[10px] font-black mt-2 block">
                Tất cả dữ liệu liên quan (chỉ số, bài viết, mục tiêu, chat) sẽ bị xóa vĩnh viễn!
              </span>
            </p>
            <div className="flex gap-3 pt-4">
              <button 
                type="button" 
                onClick={() => setDeletingUser(null)} 
                className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px] hover:bg-slate-200 transition-all"
              >
                Hủy
              </button>
              <button 
                onClick={handleDeleteUser} 
                className="flex-1 py-4 rounded-2xl bg-rose-600 text-white font-black uppercase text-[11px] shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4">
          <form onSubmit={handleUpdateUser} className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">Cập nhật Hội viên</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Họ tên</label>
                <input value={editingUser.fullName} onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Vai trò</label>
                <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold text-xs">
                  {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Trạng thái tài khoản</label>
              <select value={editingUser.status} onChange={e => setEditingUser({...editingUser, status: e.target.value as AccountStatus})} className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-xs">
                {Object.values(AccountStatus).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mật khẩu mới (Để trống nếu không đổi)</label>
              <input 
                type="text" 
                placeholder="Nhập mật khẩu mới..."
                onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
                className="w-full px-4 py-3 bg-rose-50/30 text-rose-700 rounded-xl outline-none font-bold text-xs border border-rose-100 focus:border-rose-300" 
              />
            </div>
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[11px]">Hủy</button>
              <button type="submit" className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[11px] shadow-lg">Lưu thông tin</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default memo(UserManagement);
