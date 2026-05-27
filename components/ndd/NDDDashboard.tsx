import React, { useState, useEffect, useCallback, memo } from 'react';
import { User } from '../../types.ts';
import { Database } from '../../services/database.ts';

interface NDDDashboardProps {
  currentUser: User;
}

const NDDDashboard: React.FC<NDDDashboardProps> = memo(({ currentUser }) => {
  const [dashboardData, setDashboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNdd, setSelectedNdd] = useState<any | null>(null);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [coOwnerIds, setCoOwnerIds] = useState<string[]>([]);
  const [showCoOwnerEditor, setShowCoOwnerEditor] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [chatBox, setChatBox] = useState<{ userId: string; userName: string } | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [metricForm, setMetricForm] = useState<{ userId: string; userName: string } | null>(null);
  const [metricWeight, setMetricWeight] = useState('');
  const [metricBodyFat, setMetricBodyFat] = useState('');
  const [metricMuscleMass, setMetricMuscleMass] = useState('');

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch('/api/nutrition-groups/my-dashboard', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setDashboardData(data.groups || []);
        if (data.groups?.[0]?.group?.coOwners) {
          setCoOwnerIds(data.groups[0].group.coOwners.map((c: any) => c._id || c));
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
    if (!selectedNdd?.group?.id) return;
    try {
      const resp = await fetch(`/api/nutrition-groups/${selectedNdd.group.id}/co-owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` },
        body: JSON.stringify({ coOwnerIds }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSelectedNdd((prev: any) => ({ ...prev, group: { ...prev.group, coOwners: data.coOwners } }));
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
    if (!selectedNdd?.group?.id) return;
    try {
      await Database.approveNutritionGroupMember(selectedNdd.group.id, userId);
      setActionMsg({ type: 'success', text: `✅ Đã duyệt ${userName}` });
      fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    }
  };

  const handleReject = async (userId: string) => {
    if (!selectedNdd?.group?.id) return;
    try {
      await Database.rejectNutritionGroupMember(selectedNdd.group.id, userId);
      setActionMsg({ type: 'success', text: '✅ Đã từ chối' });
      fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    }
  };

  const handleSendMetric = async () => {
    if (!metricForm || !metricWeight) return;
    try {
      const actorId = (currentUser as any).id || (currentUser as any)._id;
      await Database.saveMetric({
        userId: metricForm.userId,
        weight: parseFloat(metricWeight),
        bodyFat: metricBodyFat ? parseFloat(metricBodyFat) : undefined,
        muscleMass: metricMuscleMass ? parseFloat(metricMuscleMass) : undefined,
        date: new Date().toISOString().split('T')[0],
        actorId,
        actorName: currentUser?.fullName,
      });
      setActionMsg({ type: 'success', text: `✅ Đã cập nhật chỉ số cho ${metricForm.userName}` });
      setMetricForm(null);
      setMetricWeight('');
      setMetricBodyFat('');
      setMetricMuscleMass('');
      fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleSendChat = async () => {
    if (!chatBox || !chatMessage.trim()) return;
    try {
      // Gửi tin nhắn đến member qua API chat
      await fetch('/api/chats/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` },
        body: JSON.stringify({ receiverId: chatBox.userId, content: chatMessage.trim() }),
      });
      setActionMsg({ type: 'success', text: `✅ Đã gửi tin nhắn đến ${chatBox.userName}` });
      setChatBox(null);
      setChatMessage('');
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
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

  if (dashboardData.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <div className="text-6xl mb-4">🏥</div>
        <p className="text-lg font-bold text-slate-600">Bạn chưa có NDD để quản lý</p>
        <p className="text-xs text-slate-400 mt-2">Vui lòng liên hệ Admin để được phân quyền</p>
      </div>
    );
  }

  // Nếu chưa chọn NDD, hiển thị danh sách
  if (!selectedNdd) {
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

        <h2 className="font-black text-slate-800 text-lg uppercase tracking-widest">🏥 Danh sách NDD</h2>
        <p className="text-xs text-slate-400">Chọn NDD để quản lý hội viên</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashboardData.map((item: any, idx: number) => {
            const group = item.group;
            const memberMetrics = item.memberMetrics || [];
            return (
              <div
                key={idx}
                onClick={() => {
                  setSelectedNdd(item);
                  setShowCoOwnerEditor(false);
                  setShowPending(false);
                }}
                className="bg-white rounded-[2rem] border border-emerald-200 shadow-sm overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-4">
                  <h3 className="text-white font-black text-sm">{group.name}</h3>
                  <p className="text-emerald-100 text-[10px] mt-0.5">{group.address || 'Chưa có địa chỉ'}</p>
                </div>
                <div className="p-4 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    👥 <strong>{memberMetrics.length}</strong> hội viên
                  </span>
                  <span className="text-emerald-600 font-bold group-hover:translate-x-1 transition-transform">
                    Xem chi tiết →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Đã chọn NDD → hiển thị chi tiết
  const group = selectedNdd.group;
  const memberMetrics = selectedNdd.memberMetrics || [];
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const isOwner = group.ownerId?._id === currentUserId || group.ownerId === currentUserId;
  const pendingMembers = group.pendingMembers || [];
  const groupId = group.id || group._id;

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

      {/* Back button */}
      <button
        onClick={() => { setSelectedNdd(null); setSelectedMember(null); }}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 font-bold transition-all"
      >
        ← Quay lại danh sách NDD
      </button>

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
              <p className="font-bold text-slate-800 text-sm mt-1">{memberMetrics.length} người</p>
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
              {pendingMembers.map((p: any, idx: number) => {
                // Xác định userId string an toàn
                const userIdStr = typeof p.userId === 'object' && p.userId !== null
                  ? (p.userId._id || p.userId.id || p.userId.toString())
                  : String(p.userId);
                const userName = p.fullName || (typeof p.userId === 'object' ? p.userId?.fullName : '') || p.userName || 'Unknown';
                return (
                  <div key={idx} className="flex items-center justify-between bg-white rounded-xl p-2">
                    <span className="text-xs font-bold text-slate-700">{userName}</span>
                    <div className="flex gap-1">
                      <button onClick={() => handleApprove(userIdStr, userName)} className="px-3 py-1 bg-emerald-500 text-white rounded-xl text-[9px] font-bold hover:bg-emerald-600">Duyệt</button>
                      <button onClick={() => handleReject(userIdStr)} className="px-3 py-1 bg-rose-100 text-rose-600 rounded-xl text-[9px] font-bold hover:bg-rose-200">Từ chối</button>
                    </div>
                  </div>
                );
              })}
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
            const uid = user._id || user.id;

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

                {/* HLV actions */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50">
                  <button
                    onClick={() => setMetricForm({ userId: uid, userName: user.fullName })}
                    className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all"
                  >
                    📊 Nhập chỉ số
                  </button>
                  <button
                    onClick={() => setChatBox({ userId: uid, userName: user.fullName })}
                    className="flex-1 py-2 rounded-xl bg-indigo-50 text-indigo-600 font-black text-[9px] uppercase tracking-wider hover:bg-indigo-100 transition-all"
                  >
                    💬 Nhắn tin
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Metric Form Modal */}
      {metricForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
              📊 Nhập chỉ số cho {metricForm.userName}
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  value={metricWeight}
                  onChange={e => setMetricWeight(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1"
                  placeholder="VD: 65.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ cơ thể (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={metricBodyFat}
                  onChange={e => setMetricBodyFat(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1"
                  placeholder="VD: 22.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cơ bắp (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={metricMuscleMass}
                  onChange={e => setMetricMuscleMass(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1"
                  placeholder="VD: 42.0"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setMetricForm(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">
                Hủy
              </button>
              <button onClick={handleSendMetric} className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] shadow-lg">
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Box Modal */}
      {chatBox && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95">
            <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">
              💬 Nhắn tin cho {chatBox.userName}
            </h4>
            <textarea
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm h-24 resize-none"
              placeholder="Nhập nội dung tin nhắn..."
            />
            <div className="flex gap-3 pt-2">
              <button onClick={() => setChatBox(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">
                Hủy
              </button>
              <button onClick={handleSendChat} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px] shadow-lg">
                Gửi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

NDDDashboard.displayName = 'NDDDashboard';
export default NDDDashboard;