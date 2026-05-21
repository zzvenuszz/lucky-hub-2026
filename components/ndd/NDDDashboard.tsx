import React, { useState, useEffect, useCallback, memo } from 'react';
import { User } from '../../types.ts';
import { Database } from '../../services/database.ts';

interface NDDDashboardProps {
  currentUser: User;
}

const NDDDashboard: React.FC<NDDDashboardProps> = memo(({ currentUser }) => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [coOwnerIds, setCoOwnerIds] = useState<string[]>([]);
  const [showCoOwnerEditor, setShowCoOwnerEditor] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch('/api/nutrition-groups/my-dashboard', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setDashboard(data);
        if (data?.group?.coOwners) {
          setCoOwnerIds(data.group.coOwners.map((c: any) => c._id || c));
        }
      }
    } catch (err) {
      console.error('[NDDDashboard] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleUpdateCoOwners = async () => {
    if (!dashboard?.group?.id) return;
    try {
      const resp = await fetch(`/api/nutrition-groups/${dashboard.group.id}/co-owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` },
        body: JSON.stringify({ coOwnerIds }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setDashboard((prev: any) => ({ ...prev, group: { ...prev.group, coOwners: data.coOwners } }));
        setShowCoOwnerEditor(false);
        setActionMsg({ type: 'success', text: '✅ Đã cập nhật đồng vận hành' });
      } else {
        const err = await resp.json();
        setActionMsg({ type: 'error', text: '❌ ' + err.message });
      }
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleApprove = async (userId: string, userName: string) => {
    if (!dashboard?.group?.id) return;
    try {
      await Database.approveNutritionGroupMember(dashboard.group.id, userId);
      setActionMsg({ type: 'success', text: `✅ Đã duyệt ${userName}` });
      fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    }
  };

  const handleReject = async (userId: string) => {
    if (!dashboard?.group?.id) return;
    try {
      await Database.rejectNutritionGroupMember(dashboard.group.id, userId);
      setActionMsg({ type: 'success', text: '✅ Đã từ chối' });
      fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-10 text-center">
        <span className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-bold mt-4">Đang tải dữ liệu NDD...</p>
      </div>
    );
  }

  if (!dashboard?.group) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <div className="text-6xl mb-4">🏥</div>
        <p className="text-lg font-bold text-slate-600">Bạn chưa có NDD để quản lý</p>
        <p className="text-xs text-slate-400 mt-2">Vui lòng liên hệ Admin để được phân quyền</p>
      </div>
    );
  }

  const group = dashboard.group;
  const memberMetrics = dashboard.memberMetrics || [];
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const isOwner = group.ownerId?._id === currentUserId || group.ownerId === currentUserId;
  const pendingMembers = group.pendingMembers || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {actionMsg && (
        <div className={`px-6 py-4 rounded-2xl shadow-lg font-bold text-sm flex items-center justify-between ${
          actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {/* NDD Info Card */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-emerald-200 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
          <h2 className="text-white font-black text-lg">{group.name}</h2>
          <p className="text-emerald-100 text-xs font-medium mt-1">{group.address || 'Chưa có địa chỉ'}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">Chủ vận hành</p>
              <p className="font-bold text-slate-800 text-sm mt-1">{group.ownerName || 'Chưa có'}</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider">Đồng vận hành</p>
              <p className="font-bold text-slate-800 text-sm mt-1">
                {group.coOwners?.length > 0 
                  ? group.coOwners.map((c: any) => c.fullName || 'Unknown').join(', ')
                  : 'Chưa có'}
              </p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider">Hội viên</p>
              <p className="font-bold text-slate-800 text-sm mt-1">{group.members?.length || 0} người</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            {isOwner && (
              <button onClick={() => setShowCoOwnerEditor(!showCoOwnerEditor)} className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-all">
                👥 Quản lý đồng vận hành
              </button>
            )}
            {pendingMembers.length > 0 && (
              <button onClick={() => setShowPending(!showPending)} className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all">
                ⏳ {pendingMembers.length} yêu cầu chờ duyệt
              </button>
            )}
          </div>

          {/* Co-owner editor */}
          {showCoOwnerEditor && (
            <div className="bg-blue-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-black text-blue-600 uppercase">Chọn HLV làm đồng vận hành</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-white cursor-pointer text-xs">
                  <input type="checkbox" checked={coOwnerIds.length === 0} onChange={() => setCoOwnerIds([])} className="rounded" />
                  <span className="font-bold text-slate-500">(Không có đồng vận hành)</span>
                </label>
              </div>
              <button onClick={handleUpdateCoOwners} className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700">Lưu</button>
            </div>
          )}

          {/* Pending members */}
          {showPending && pendingMembers.length > 0 && (
            <div className="bg-amber-50 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-amber-700 uppercase">Yêu cầu chờ duyệt</p>
              {pendingMembers.map((p: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-2">
                  <span className="text-xs font-bold text-slate-700">{p.userId?.fullName || 'Unknown'}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleApprove(p.userId?._id || p.userId, p.userId?.fullName || 'Unknown')} className="px-3 py-1 bg-emerald-500 text-white rounded-xl text-[9px] font-bold hover:bg-emerald-600">Duyệt</button>
                    <button onClick={() => handleReject(p.userId?._id || p.userId)} className="px-3 py-1 bg-rose-100 text-rose-600 rounded-xl text-[9px] font-bold hover:bg-rose-200">Từ chối</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Member List with Metrics */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">👥 Danh sách hội viên</h3>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{memberMetrics.length} thành viên</p>
        </div>
        <div className="divide-y divide-slate-50">
          {memberMetrics.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs font-medium italic">Chưa có hội viên nào</div>
          ) : memberMetrics.map((item: any, idx: number) => {
            const user = item.user;
            const metric = item.latestMetric;
            return (
              <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 overflow-hidden shrink-0">
                    <img src={user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.fullName}`} className="w-full h-full object-cover" alt={user.fullName} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800 truncate">{user.fullName}</span>
                      <span className="text-[8px] font-black uppercase text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded-full">{user.role}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">@{user.username} {user.phoneNumber ? `• ${user.phoneNumber}` : ''}</p>
                  </div>
                  
                  {/* Latest metrics */}
                  <div className="hidden md:flex items-center gap-3 text-[10px]">
                    {metric ? (
                      <>
                        <div className="text-center">
                          <p className="font-black text-emerald-600">{metric.weight || '--'}</p>
                          <p className="text-[8px] text-slate-400">kg</p>
                        </div>
                        <div className="text-center">
                          <p className="font-black text-rose-500">{metric.bodyFat || '--'}%</p>
                          <p className="text-[8px] text-slate-400">mỡ</p>
                        </div>
                        <div className="text-center">
                          <p className="font-black text-blue-500">{metric.muscleMass || '--'}</p>
                          <p className="text-[8px] text-slate-400">cơ</p>
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-300 italic">Chưa có chỉ số</span>
                    )}
                  </div>
                </div>
                
                {/* Mobile metrics */}
                {metric && (
                  <div className="md:hidden flex gap-3 mt-2 ml-13 pl-13 text-[9px]">
                    <span>⚖️ {metric.weight}kg</span>
                    <span>🔴 {metric.bodyFat}%</span>
                    <span>💪 {metric.muscleMass}kg</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

NDDDashboard.displayName = 'NDDDashboard';
export default NDDDashboard;