import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { User } from '../../types.ts';
import LoadingButton from '../system/LoadingButton.tsx';

interface Goal {
  id: string;
  userId: string;
  type: string;
  targetValue: number;
  startValue: number;
  startDate: string;
  targetDate: string;
  status: 'active' | 'completed' | 'cancelled';
  progress: number;
}

interface GoalTrackingProps {
  currentUser: User;
  refreshTrigger?: number;
}

interface LatestMetrics {
  weight: number;
  bodyFat: number;
  muscleMass: number;
  waterPercent: number;
  boneMinerals: number;
  visceralFat: number;
  energy: number;
  bioAge: number;
  balanceIndex: number;
}

const GOAL_TYPES: Record<string, { label: string; unit: string; color: string; icon: string }> = {
  weight: { label: 'Cân nặng', unit: 'kg', color: 'emerald', icon: '⚖️' },
  bodyFat: { label: 'Mỡ cơ thể', unit: '%', color: 'rose', icon: '🔴' },
  muscleMass: { label: 'Lượng cơ', unit: 'kg', color: 'blue', icon: '💪' },
  waterPercent: { label: 'Nước', unit: '%', color: 'sky', icon: '💧' },
  boneMinerals: { label: 'Khoáng chất', unit: 'kg', color: 'amber', icon: '🦴' },
  visceralFat: { label: 'Mỡ nội tạng', unit: '', color: 'orange', icon: '🫀' },
  energy: { label: 'Năng lượng', unit: 'kcal', color: 'purple', icon: '⚡' },
  bioAge: { label: 'Tuổi sinh học', unit: '', color: 'indigo', icon: '🎂' },
  balanceIndex: { label: 'Cân đối', unit: '', color: 'teal', icon: '⚖️' }
};

const DURATION_OPTIONS = [
  { label: '3 ngày', days: 3 },
  { label: '1 tuần', days: 7 },
  { label: '2 tuần', days: 14 },
  { label: '3 tuần', days: 21 },
  { label: '1 tháng', days: 30 },
  { label: '2 tháng', days: 60 },
  { label: '3 tháng', days: 90 },
  { label: '6 tháng', days: 180 },
  { label: '1 năm', days: 365 }
];

const GoalTracking: React.FC<GoalTrackingProps> = memo(({ currentUser, refreshTrigger }) => {
  const currentUid = (currentUser as any).id || (currentUser as any)._id;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<LatestMetrics | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [newGoal, setNewGoal] = useState({
    type: 'weight' as string,
    targetValue: 60,
    startValue: 0,
    durationDays: 7
  });

  // Tính ngày hiện tại theo định dạng YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // Helper lấy auth headers
  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    return headers;
  }, []);

  // Fetch goals
  const fetchGoals = useCallback(async () => {
    try {
      const resp = await fetch(`/api/goals/${currentUid}`, { headers: getAuthHeaders() });
      const data = await resp.json();
      // Đảm bảo goals luôn là array, tránh lỗi "goals.filter is not a function" nếu API trả về object lỗi
      setGoals(Array.isArray(data) ? data : []);
      console.log(`[Goals] Loaded ${Array.isArray(data) ? data.length : 0} goals`);
    } catch (err: any) {
      console.error('[Goals] Fetch error:', err);
    }
  }, [currentUid, getAuthHeaders]);

  // Fetch latest metrics
  const fetchLatestMetrics = useCallback(async () => {
    try {
      const resp = await fetch(`/api/metrics/${currentUid}`, { headers: getAuthHeaders() });
      const data = await resp.json();
      if (data && data.length > 0) {
        // Sorted by date desc from API
        const latest = data[0];
        setLatestMetrics({
          weight: latest.weight || 0,
          bodyFat: latest.bodyFat || 0,
          muscleMass: latest.muscleMass || 0,
          waterPercent: latest.waterPercent || 0,
          boneMinerals: latest.boneMinerals || 0,
          visceralFat: latest.visceralFat || 0,
          energy: latest.energy || 0,
          bioAge: latest.bioAge || 0,
          balanceIndex: latest.balanceIndex || 0
        });
      }
    } catch (err: any) {
      console.error('[Goals] Fetch metrics error:', err);
    }
  }, [currentUid]);

  useEffect(() => {
    fetchGoals();
    fetchLatestMetrics();
    // Khi refreshTrigger thay đổi (có metric mới), tự động recalculate progress
    if (refreshTrigger && refreshTrigger > 0) {
      fetch(`/api/goals/recalculate/${currentUid}`, {
        method: 'POST',
        headers: getAuthHeaders()
      }).then(resp => {
        if (resp.ok) {
          console.log(`[Goals] Recalculated after metric update (refreshTrigger=${refreshTrigger})`);
          fetchGoals();
        }
      }).catch(err => console.error('[Goals] Recalculate error:', err));
    }
  }, [fetchGoals, fetchLatestMetrics, refreshTrigger, currentUid, getAuthHeaders]);

  // Tính ngày kết thúc từ duration
  const calcTargetDate = useCallback((days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }, []);

  // Lấy startValue từ metrics hiện tại dựa trên type
  const getStartValueForType = useCallback((type: string) => {
    if (!latestMetrics) return 0;
    return (latestMetrics as any)[type] || 0;
  }, [latestMetrics]);

  // Kiểm tra type đã có goal active/completed chưa
  const existingGoalTypes = useMemo(() => {
    return new Set(goals.filter(g => g.status !== 'cancelled').map(g => g.type));
  }, [goals]);

  // Khi chọn type mới trong form, tự điền startValue
  const handleTypeChange = useCallback((type: string) => {
    const startVal = getStartValueForType(type);
    setNewGoal(prev => ({
      ...prev,
      type,
      startValue: startVal,
      targetValue: startVal // mặc định target = start, user tự điều chỉnh
    }));
  }, [getStartValueForType]);

  // Khi mở form thêm mới
  const handleOpenAddForm = useCallback(() => {
    const firstAvailableType = Object.keys(GOAL_TYPES).find(t => !existingGoalTypes.has(t)) || Object.keys(GOAL_TYPES)[0];
    const startVal = getStartValueForType(firstAvailableType);
    setEditingGoal(null);
    setNewGoal({
      type: firstAvailableType,
      targetValue: startVal,
      startValue: startVal,
      durationDays: 7
    });
    setShowForm(true);
  }, [existingGoalTypes, getStartValueForType]);

  // Khi mở form sửa
  const handleOpenEditForm = useCallback((goal: Goal) => {
    setEditingGoal(goal);
    setNewGoal({
      type: goal.type,
      targetValue: goal.targetValue,
      startValue: goal.startValue,
      durationDays: 7
    });
    setShowForm(true);
  }, []);

  // Tạo hoặc cập nhật goal
  const handleSaveGoal = async () => {
    if (newGoal.targetValue <= 0) return alert('Vui lòng nhập giá trị mục tiêu hợp lệ');

    const startDate = todayStr;
    const targetDate = calcTargetDate(newGoal.durationDays);

    try {
      let resp;
      if (editingGoal) {
        // Update existing goal
        resp = await fetch(`/api/goals/${editingGoal.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            targetValue: newGoal.targetValue,
            targetDate
          })
        });
        if (resp.ok) {
          console.log(`[Goals] Updated goal ${editingGoal.id}`);
        }
      } else {
        // Check duplicate type
        if (existingGoalTypes.has(newGoal.type)) {
          return alert(`Bạn đã có mục tiêu "${GOAL_TYPES[newGoal.type]?.label}" rồi. Hãy sửa mục tiêu cũ nếu muốn thay đổi.`);
        }

        resp = await fetch('/api/goals', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: currentUid,
            type: newGoal.type,
            targetValue: newGoal.targetValue,
            startValue: newGoal.startValue,
            startDate,
            targetDate
          })
        });
        if (resp.ok) {
          console.log(`[Goals] Created goal: ${newGoal.type}`);
        }
      }

      if (resp?.ok) {
        setShowForm(false);
        setEditingGoal(null);
        await fetchGoals();
        // Recalculate progress
        await fetch(`/api/goals/recalculate/${currentUid}`, { 
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
    } catch (err: any) {
      console.error('[Goals] Save error:', err);
    }
  };

  // Hủy goal
  const handleCancelGoal = async (goalId: string) => {
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'cancelled' })
      });
      fetchGoals();
    } catch (err: any) {
      console.error('[Goals] Cancel error:', err);
    }
  };

  const activeGoals = goals.filter(g => g.status !== 'cancelled');
  const info = (type: string) => GOAL_TYPES[type] || { label: type, unit: '', color: 'slate', icon: '📊' };

  // Các type chưa có goal (dùng để lọc dropdown)
  const availableTypes = Object.keys(GOAL_TYPES).filter(t => !existingGoalTypes.has(t) || editingGoal?.type === t);

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-[32px] border border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-5 shadow-[0_24px_60px_rgba(16,185,129,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              <span>🎯</span>
              <span>Goal tracking</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-800">Mục tiêu sức khỏe</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Theo dõi tiến độ hoàn thành</p>
          </div>
          {!showForm && (
            <LoadingButton onClick={handleOpenAddForm} variant="primary" size="sm" className="!rounded-2xl !shadow-lg !shadow-emerald-100">
              + Thêm mục tiêu
            </LoadingButton>
          )}
        </div>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-[28px] border border-emerald-100 bg-white p-5 shadow-[0_20px_50px_rgba(16,185,129,0.06)] sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-800">{editingGoal ? 'Sửa mục tiêu' : 'Mục tiêu mới'}</h3>
            <button onClick={() => { setShowForm(false); setEditingGoal(null); }} className="text-sm font-bold text-slate-400 transition hover:text-slate-600">✕ Đóng</button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Loại chỉ số</label>
              <select value={newGoal.type} onChange={e => handleTypeChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" disabled={!!editingGoal}>
                {availableTypes.map(k => {
                  const v = GOAL_TYPES[k];
                  return <option key={k} value={k}>{v.icon} {v.label} ({v.unit})</option>;
                })}
                {availableTypes.length === 0 && <option value="">Đã đủ các loại mục tiêu</option>}
              </select>
              {editingGoal && <p className="mt-1 text-[10px] font-bold text-amber-500">Không thể đổi loại mục tiêu khi đang sửa</p>}
              {!editingGoal && availableTypes.length === 0 && <p className="mt-1 text-[10px] font-bold text-rose-500">Bạn đã có mục tiêu cho tất cả các loại. Hãy sửa mục tiêu cũ.</p>}
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Giá trị hiện tại</label>
              <input type="number" inputMode="numeric" value={newGoal.startValue} onChange={e => setNewGoal({...newGoal, startValue: parseFloat(e.target.value) || 0})} className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-500 outline-none" readOnly />
              <p className="mt-1 text-[10px] text-slate-400">Tự động cập nhật từ chỉ số mới nhất</p>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Mục tiêu muốn đạt</label>
              <input type="number" inputMode="numeric" value={newGoal.targetValue} onChange={e => setNewGoal({...newGoal, targetValue: parseFloat(e.target.value) || 0})} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" step="0.1" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Thời gian thực hiện</label>
              <select value={newGoal.durationDays} onChange={e => setNewGoal({...newGoal, durationDays: parseInt(e.target.value)})} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100">
                {DURATION_OPTIONS.map(opt => (<option key={opt.days} value={opt.days}>{opt.label}</option>))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">Bắt đầu: {todayStr} → Kết thúc: {calcTargetDate(newGoal.durationDays)}</p>
            </div>
          </div>
          <LoadingButton onClick={handleSaveGoal} variant="primary" size="md" loadingText="Đang lưu..." disabled={availableTypes.length === 0 && !editingGoal} className="!w-full !rounded-2xl !py-3 !text-xs">
            {editingGoal ? '💾 CẬP NHẬT MỤC TIÊU' : '🎯 TẠO MỤC TIÊU'}
          </LoadingButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {activeGoals.map(goal => {
          const gInfo = info(goal.type);
          const isCompleted = goal.status === 'completed';
          const now = Date.now();
          const targetTime = new Date(goal.targetDate).getTime();
          const startTime = new Date(goal.startDate).getTime();
          const totalDuration = targetTime - startTime;
          const elapsed = now - startTime;
          const progressTime = totalDuration > 0 ? elapsed / totalDuration : 0;
          const daysLeft = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24));

          let barColor = 'bg-emerald-500';
          if (isCompleted && daysLeft <= 2) barColor = 'bg-purple-500';
          else if (daysLeft <= 2 && goal.progress < 100) barColor = 'bg-rose-600';
          else if (progressTime >= 0.5 && goal.progress < 100) barColor = 'bg-amber-500';

          let borderColor = 'border-slate-200';
          if (isCompleted) borderColor = 'border-emerald-400';
          else if (daysLeft <= 2) borderColor = 'border-rose-400';
          else if (progressTime >= 0.5) borderColor = 'border-amber-400';

          let daysLeftColor = 'text-emerald-500';
          if (daysLeft <= 2) daysLeftColor = 'text-rose-500';
          else if (daysLeft <= 7) daysLeftColor = 'text-amber-500';

          return (
            <div key={goal.id} className={`rounded-[28px] border bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 ${borderColor} ${isCompleted ? 'bg-emerald-50/30' : ''}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">{gInfo.icon}</span>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{gInfo.label}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{goal.startValue} → {goal.targetValue} {gInfo.unit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <span className="rounded-xl bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">🏆 Hoàn thành</span>
                  ) : (
                    <>
                      <button onClick={() => handleOpenEditForm(goal)} className="rounded-xl px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-500 transition hover:bg-blue-50">✏️ Sửa</button>
                      <LoadingButton onClick={() => handleCancelGoal(goal.id)} variant="danger" size="sm" loadingText="..." className="!rounded-xl !bg-transparent !px-2 !py-1 !text-[10px] !font-black !uppercase !tracking-[0.12em] !text-rose-500 hover:!bg-rose-50 !shadow-none">
                        ✕ Hủy
                      </LoadingButton>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, goal.progress)}%` }} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-slate-600">{goal.progress}%</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-400">{goal.startDate} → {goal.targetDate}</span>
                  {!isCompleted && <span className={`font-black ${daysLeftColor}`}>(còn {daysLeft} ngày)</span>}
                </div>
              </div>
            </div>
          );
        })}
        {activeGoals.length === 0 && (
          <div className="col-span-full rounded-[28px] border border-slate-200 bg-white p-16 text-center text-slate-400">
            <div className="mb-3 text-4xl">🎯</div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Chưa có mục tiêu nào</div>
            <p className="mt-2 text-xs text-slate-400">Hãy tạo mục tiêu sức khỏe đầu tiên của bạn!</p>
          </div>
        )}
      </div>
    </div>
  );
});

GoalTracking.displayName = 'GoalTracking';
export default GoalTracking;