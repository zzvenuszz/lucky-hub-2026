import React, { useState, useEffect, useCallback, memo, useRef, useMemo } from 'react';
import { User } from '../../types.ts';
import { Database } from '../../services/database.ts';
import MemberMetricsManager from './MemberMetricsManager.tsx';
import LoadingButton from '../system/LoadingButton.tsx';
import { useBodyScrollLock, useModalStack } from '../system/ModalManager.tsx';

interface NDDDashboardProps {
  currentUser: User;
}

const NDDDashboard: React.FC<NDDDashboardProps> = memo(({ currentUser }) => {
  const [dashboardData, setDashboardData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNdd, setSelectedNdd] = useState<any | null>(null);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [coachCandidates, setCoachCandidates] = useState<any[]>([]);
  const [selectedCoOwnerIds, setSelectedCoOwnerIds] = useState<string[]>([]);
  const [showCoOwnerEditor, setShowCoOwnerEditor] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [chatBox, setChatBox] = useState<{ userId: string; userName: string } | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [metricsManager, setMetricsManager] = useState<{ userId: string; userName: string } | null>(null);
  const [metricForm, setMetricForm] = useState<{ userId: string; userName: string } | null>(null);
  const [metricWeight, setMetricWeight] = useState('');
  const [metricBodyFat, setMetricBodyFat] = useState('');
  const [metricMuscleMass, setMetricMuscleMass] = useState('');
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const dashboardDataRef = useRef<any[]>([]);

  const fetchCoachCandidates = useCallback(async () => {
    try {
      const resp = await fetch('/api/users/coach-candidates', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setCoachCandidates(data || []);
      }
    } catch (err) {
      console.error('[NDDDashboard] Fetch coach candidates error:', err);
    }
  }, []);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    const sessionToken = localStorage.getItem('lucky_hub_session');
    try {
      const resp = await fetch('/api/nutrition-groups/my-dashboard', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      const data = await resp.json();
      const newData = data.groups || [];
      setDashboardData(newData);
      dashboardDataRef.current = newData;
      if (data.groups?.[0]?.group?.coOwners) {
        setSelectedCoOwnerIds(data.groups[0].group.coOwners.map((c: any) => c._id || c));
      }
    } catch (err) {
      console.error('[NDDDashboard] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    const sessionToken = localStorage.getItem('lucky_hub_session');
    try {
      const resp = await fetch('/api/nutrition-groups/my-dashboard', {
        headers: { 'Authorization': `Bearer ${sessionToken}` }
      });
      const data = await resp.json();
      const newData = data.groups || [];
      setDashboardData(newData);
      dashboardDataRef.current = newData;
      if (selectedNdd) {
        const updated = newData.find((item: any) => item.group.id === selectedNdd.group.id);
        if (updated) setSelectedNdd(updated);
      }
    } catch (err) {
      console.error('[NDDDashboard] Refresh error:', err);
    }
  }, [selectedNdd]);

  useEffect(() => { fetchDashboard(); fetchCoachCandidates(); }, [fetchDashboard, fetchCoachCandidates]);

  const handleUpdateCoOwners = async () => {
    if (!selectedNdd?.group?.id) return;
    try {
      const resp = await fetch(`/api/nutrition-groups/${selectedNdd.group.id}/co-owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` },
        body: JSON.stringify({ coOwnerIds: selectedCoOwnerIds }),
      });
      if (resp.ok) {
        await refreshDashboard();
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
    setApprovingUserId(userId);
    try {
      await Database.approveNutritionGroupMember(selectedNdd.group.id, userId);
      await refreshDashboard();
      setActionMsg({ type: 'success', text: `✅ Đã duyệt ${userName}` });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    } finally {
      setApprovingUserId(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!selectedNdd?.group?.id) return;
    setRejectingUserId(userId);
    try {
      await Database.rejectNutritionGroupMember(selectedNdd.group.id, userId);
      await refreshDashboard();
      setShowPending(false);
      setActionMsg({ type: 'success', text: '✅ Đã từ chối' });
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ ' + err.message });
    } finally {
      setRejectingUserId(null);
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
      await fetchDashboard();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: '❌ Lỗi: ' + err.message });
    }
  };

  const handleSendChat = async () => {
    if (!chatBox || !chatMessage.trim()) return;
    try {
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

  if (!selectedNdd) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-20">
        {actionMsg && (
          <div className={`px-6 py-4 rounded-2xl shadow-lg font-bold text-sm flex items-center justify-between ${actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
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
              <div key={idx} onClick={() => { setSelectedNdd(item); setShowCoOwnerEditor(false); setShowPending(false); }} className="bg-white rounded-[2rem] border border-emerald-200 shadow-sm overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group">
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-4">
                  <h3 className="text-white font-black text-sm">{group.name}</h3>
                  <p className="text-emerald-100 text-[10px] mt-0.5">{group.address || 'Chưa có địa chỉ'}</p>
                </div>
                <div className="p-4 flex items-center justify-between text-xs">
                  <span className="text-slate-600">👥 <strong>{memberMetrics.length}</strong> hội viên</span>
                  <span className="text-emerald-600 font-bold group-hover:translate-x-1 transition-transform">Xem chi tiết →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const group = selectedNdd.group;
  const memberMetrics = selectedNdd.memberMetrics || [];
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const isOwner = group.ownerId?._id === currentUserId || group.ownerId === currentUserId;
  const pendingMembers = group.pendingMembers || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {actionMsg && (
        <div className={`px-6 py-4 rounded-2xl shadow-lg font-bold text-sm flex items-center justify-between ${actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <button onClick={() => { setSelectedNdd(null); setSelectedMember(null); }} className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 font-bold transition-all">← Quay lại danh sách NDD</button>

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
              <p className="font-bold text-slate-800 text-sm mt-1">{group.coOwners?.length > 0 ? group.coOwners.map((c: any) => c.fullName || 'Unknown').join(', ') : 'Chưa có'}</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider">Hội viên</p>
              <p className="font-bold text-slate-800 text-sm mt-1">{memberMetrics.length} người</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
            {isOwner && (<button onClick={() => setShowCoOwnerEditor(!showCoOwnerEditor)} className="px-5 py-2.5 bg-blue-500 text-white rounded-xl text-xs font-bold hover:bg-blue-600 transition-all">👥 Quản lý đồng vận hành</button>)}
            {(isOwner || true) && (<button onClick={() => { console.log('[NDDDashboard] Click pending btn, pendingMembers:', pendingMembers); setShowPending(!showPending); }} className="px-5 py-2.5 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all">⏳ {pendingMembers.length} yêu cầu chờ duyệt</button>)}
          </div>
        </div>
      </div>

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
                    <span className="font-bold text-sm text-slate-800 truncate">{user.fullName}</span>
                    <p className="text-[10px] text-slate-400">@{user.username}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50">
                  <button onClick={() => setMetricsManager({ userId: uid, userName: user.fullName })} className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-black text-[9px] uppercase tracking-wider hover:bg-emerald-100 transition-all">📊 Quản lý chỉ số</button>
                  <button onClick={() => setChatBox({ userId: uid, userName: user.fullName })} className="flex-1 py-2 rounded-xl bg-indigo-50 text-indigo-600 font-black text-[9px] uppercase tracking-wider hover:bg-indigo-100 transition-all">💬 Nhắn tin</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {metricForm && <MetricFormSubModal metricForm={metricForm} metricWeight={metricWeight} setMetricWeight={setMetricWeight} metricBodyFat={metricBodyFat} setMetricBodyFat={setMetricBodyFat} metricMuscleMass={metricMuscleMass} setMetricMuscleMass={setMetricMuscleMass} onCancel={() => setMetricForm(null)} onSave={handleSendMetric} />}
      {chatBox && <ChatBoxSubModal chatBox={chatBox} chatMessage={chatMessage} setChatMessage={setChatMessage} onCancel={() => setChatBox(null)} onSend={handleSendChat} />}
      {metricsManager && <MemberMetricsManager userId={metricsManager.userId} userName={metricsManager.userName} currentUser={currentUser} onClose={() => setMetricsManager(null)} />}
      {showCoOwnerEditor && <CoOwnerEditorSubModal coachCandidates={coachCandidates} selectedCoOwnerIds={selectedCoOwnerIds} setSelectedCoOwnerIds={setSelectedCoOwnerIds} onSave={handleUpdateCoOwners} onCancel={() => setShowCoOwnerEditor(false)} />}
      {showPending && <PendingMembersSubModal pendingMembers={pendingMembers} handleApprove={handleApprove} handleReject={handleReject} approvingUserId={approvingUserId} rejectingUserId={rejectingUserId} onCancel={() => setShowPending(false)} />}
    </div>
  );
});

NDDDashboard.displayName = 'NDDDashboard';

// Sub-modals
interface MetricFormSubModalProps {
  metricForm: { userId: string; userName: string };
  metricWeight: string;
  setMetricWeight: (v: string) => void;
  metricBodyFat: string;
  setMetricBodyFat: (v: string) => void;
  metricMuscleMass: string;
  setMetricMuscleMass: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

const MetricFormSubModal: React.FC<MetricFormSubModalProps> = memo(({ metricForm, metricWeight, setMetricWeight, metricBodyFat, setMetricBodyFat, metricMuscleMass, setMetricMuscleMass, onCancel, onSave }) => {
  const subModalId = useMemo(() => `metric-form-ndd_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(subModalId, onCancel);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">📊 Nhập chỉ số cho {metricForm.userName}</h4>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cân nặng (kg) *</label>
            <input type="number" step="0.1" value={metricWeight} onChange={e => setMetricWeight(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1" placeholder="VD: 65.5" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mỡ cơ thể (%)</label>
            <input type="number" step="0.1" value={metricBodyFat} onChange={e => setMetricBodyFat(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1" placeholder="VD: 22.5" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cơ bắp (kg)</label>
            <input type="number" step="0.1" value={metricMuscleMass} onChange={e => setMetricMuscleMass(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm mt-1" placeholder="VD: 42.0" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
          <LoadingButton onClick={onSave} variant="primary" size="lg" loadingText="Đang lưu..." className="!flex-1">Lưu</LoadingButton>
        </div>
      </div>
    </div>
  );
});

MetricFormSubModal.displayName = 'MetricFormSubModal';

interface ChatBoxSubModalProps {
  chatBox: { userId: string; userName: string };
  chatMessage: string;
  setChatMessage: (v: string) => void;
  onCancel: () => void;
  onSend: () => void;
}

const ChatBoxSubModal: React.FC<ChatBoxSubModalProps> = memo(({ chatBox, chatMessage, setChatMessage, onCancel, onSend }) => {
  const subModalId = useMemo(() => `chat-box-ndd_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(subModalId, onCancel);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">💬 Nhắn tin cho {chatBox.userName}</h4>
        <textarea value={chatMessage} onChange={e => setChatMessage(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none font-bold text-sm h-24 resize-none" placeholder="Nhập nội dung tin nhắn..." />
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px]">Hủy</button>
          <LoadingButton onClick={onSend} variant="primary" size="lg" loadingText="Đang gửi..." className="!flex-1 !bg-indigo-600 hover:!bg-indigo-700">Gửi</LoadingButton>
        </div>
      </div>
    </div>
  );
});

ChatBoxSubModal.displayName = 'ChatBoxSubModal';

// ─── Co‑Owner Editor Modal ──────────────────────────────────────
interface CoOwnerEditorSubModalProps {
  coachCandidates: any[];
  selectedCoOwnerIds: string[];
  setSelectedCoOwnerIds: (ids: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
}

const CoOwnerEditorSubModal: React.FC<CoOwnerEditorSubModalProps> = memo(({
  coachCandidates,
  selectedCoOwnerIds,
  setSelectedCoOwnerIds,
  onSave,
  onCancel,
}) => {
  const subModalId = useMemo(() => `co-owner-editor_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(subModalId, onCancel);

  const toggleCoach = useCallback((coachId: string) => {
    setSelectedCoOwnerIds(
      selectedCoOwnerIds.includes(coachId)
        ? selectedCoOwnerIds.filter(id => id !== coachId)
        : [...selectedCoOwnerIds, coachId]
    );
  }, [selectedCoOwnerIds, setSelectedCoOwnerIds]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
      <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">👥 Quản lý đồng vận hành</h4>
        <p className="text-[10px] text-slate-400 font-medium">Chọn HLV làm đồng vận hành cho NDD này</p>

        <div className="max-h-72 overflow-y-auto space-y-2 no-scrollbar">
          {coachCandidates.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6 italic">Không có HLV nào khả dụng</p>
          ) : coachCandidates.map((coach: any) => {
            const coachId = coach.id || coach._id;
            const isSelected = selectedCoOwnerIds.includes(coachId);
            return (
              <label key={coachId} onClick={() => toggleCoach(coachId)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-transparent hover:bg-slate-100'}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                  {isSelected && <span className="text-white text-xs font-black">✓</span>}
                </div>
                <img src={coach.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${coach.fullName}`} className="w-8 h-8 rounded-lg object-cover shrink-0" alt={coach.fullName} />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm text-slate-800 truncate block">{coach.fullName}</span>
                  <p className="text-[10px] text-slate-400">@{coach.username}</p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Hủy</button>
          <LoadingButton onClick={onSave} variant="primary" size="lg" loadingText="Đang lưu..." className="!flex-1">Lưu thay đổi</LoadingButton>
        </div>
      </div>
    </div>
  );
});

CoOwnerEditorSubModal.displayName = 'CoOwnerEditorSubModal';

// ─── Pending Members Modal ──────────────────────────────────────
interface PendingMembersSubModalProps {
  pendingMembers: any[];
  handleApprove: (userId: string, userName: string) => void;
  handleReject: (userId: string) => void;
  approvingUserId: string | null;
  rejectingUserId: string | null;
  onCancel: () => void;
}

const PendingMembersSubModal: React.FC<PendingMembersSubModalProps> = memo(({
  pendingMembers,
  handleApprove,
  handleReject,
  approvingUserId,
  rejectingUserId,
  onCancel,
}) => {
  const subModalId = useMemo(() => `pending-members_${Math.random().toString(36).slice(2, 9)}`, []);
  useBodyScrollLock(true);
  useModalStack(subModalId, onCancel);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[1200] flex items-center justify-center p-3 md:p-4">
      <div className="bg-white w-full max-w-lg rounded-[2rem] p-6 space-y-4 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm">⏳ Yêu cầu chờ duyệt</h4>
        <p className="text-[10px] text-slate-400 font-medium">Có {pendingMembers.length} hội viên đang chờ được duyệt vào NDD</p>

        <div className="max-h-72 overflow-y-auto space-y-2 no-scrollbar">
          {pendingMembers.map((pm: any, idx: number) => {
            const user = pm.userId || pm;
            const uid = user._id || user.id;
            const fullName = user.fullName || 'Không có tên';
            const username = user.username || '';
            const avatar = user.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${fullName}`;
            return (
              <div key={uid || idx} className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                <img src={avatar} className="w-10 h-10 rounded-xl object-cover shrink-0" alt={fullName} />
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm text-slate-800 truncate block">{fullName}</span>
                  <p className="text-[10px] text-slate-400">@{username}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(uid, fullName)}
                    disabled={approvingUserId === uid}
                    className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all disabled:opacity-50"
                  >
                    {approvingUserId === uid ? '...' : 'Duyệt'}
                  </button>
                  <button
                    onClick={() => handleReject(uid)}
                    disabled={rejectingUserId === uid}
                    className="px-3 py-2 bg-rose-400 text-white rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-rose-500 transition-all disabled:opacity-50"
                  >
                    {rejectingUserId === uid ? '...' : 'Từ chối'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex pt-2 border-t border-slate-100">
          <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Đóng</button>
        </div>
      </div>
    </div>
  );
});

PendingMembersSubModal.displayName = 'PendingMembersSubModal';

export default NDDDashboard;
