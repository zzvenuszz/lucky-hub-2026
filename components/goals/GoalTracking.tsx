import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { User } from '../../types.ts';

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
    const sessionId = localStorage.getItem('lucky_hub_session');
    if (sessionId) {
      headers['Authorization'] = `Bearer ${sessionId}`;
    }
    return headers;
  }, []);

  // Fetch goals
  const fetchGoals = useCallback(async () => {
    try {
      const resp = await fetch(`/api/goals/${currentUid}`, { headers: getAuthHeaders() });
      const data = await resp.json();
      setGoals(data || []);
      console.log(`[Goals] Loaded ${data?.length || 0} goals`);
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
  }, [fetchGoals, fetchLatestMetrics, refreshTrigger]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Mục tiêu sức khỏe</h2>
          <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Theo dõi tiến độ hoàn thành</p>
        </div>
        {!showForm && (
          <button onClick={handleOpenAddForm} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-100 font-bold hover:bg-emerald-700 transition-all">
            + Thêm mục tiêu
          </button>
        )}
      </div>

      {/* Form thêm/sửa mục tiêu */}
      {showForm && (
        <div className="bg-white rounded-[2rem] border border-emerald-100 shadow-sm p-6 space-y-4 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-700">{editingGoal ? '✏️ Sửa mục tiêu' : '📋 Mục tiêu mới'}</h3>
            <button onClick={() => { setShowForm(false); setEditingGoal(null); }} className="text-slate-400 hover:text-slate-600 text-sm font-bold">✕ Đóng</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Loại chỉ số</label>
              <select
                value={newGoal.type}
                onChange={e => handleTypeChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm"
                disabled={!!editingGoal}
              >
                {availableTypes.map(k => {
                  const v = GOAL_TYPES[k];
                  return <option key={k} value={k}>{v.icon} {v.label} ({v.unit})</option>;
                })}
                {availableTypes.length === 0 && <option value="">Đã đủ các loại mục tiêu</option>}
              </select>
              {editingGoal && (
                <p className="text-[10px] text-amber-500 font-bold mt-1">Không thể đổi loại mục tiêu khi đang sửa</p>
              )}
              {!editingGoal && availableTypes.length === 0 && (
                <p className="text-[10px] text-rose-500 font-bold mt-1">Bạn đã có mục tiêu cho tất cả các loại. Hãy sửa mục tiêu cũ.</p>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Giá trị hiện tại</label>
              <input
                type="number"
                value={newGoal.startValue}
                onChange={e => setNewGoal({...newGoal, startValue: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-3 rounded-xl bg-slate-100 border-none font-bold text-sm text-slate-500"
                readOnly
              />
              <p className="text-[10px] text-slate-400 mt-1">Tự động cập nhật từ chỉ số mới nhất</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Mục tiêu muốn đạt</label>
              <input
                type="number"
                value={newGoal.targetValue}
                onChange={e => setNewGoal({...newGoal, targetValue: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm"
                step="0.1"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Thời gian thực hiện</label>
              <select
                value={newGoal.durationDays}
                onChange={e => setNewGoal({...newGoal, durationDays: parseInt(e.target.value)})}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm"
              >
                {DURATION_OPTIONS.map(opt => (
                  <option key={opt.days} value={opt.days}>{opt.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Bắt đầu: {todayStr} → Kết thúc: {calcTargetDate(newGoal.durationDays)}
              </p>
            </div>
          </div>
          <button
            onClick={handleSaveGoal}
            disabled={availableTypes.length === 0 && !editingGoal}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {editingGoal ? '💾 CẬP NHẬT MỤC TIÊU' : '🎯 TẠO MỤC TIÊU'}
          </button>
        </div>
      )}

      {/* Danh sách mục tiêu */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeGoals.map(goal => {
          const gInfo = info(goal.type);
          const colorMap: Record<string, string> = {
            emerald: 'bg-emerald-500', rose: 'bg-rose-500', blue: 'bg-blue-500',
            sky: 'bg-sky-500', amber: 'bg-amber-500', orange: 'bg-orange-500',
            purple: 'bg-purple-500', indigo: 'bg-indigo-500', teal: 'bg-teal-500'
          };
          const bgColor = colorMap[gInfo.color] || 'bg-slate-500';
          const isCompleted = goal.status === 'completed';

          return (
            <div key={goal.id} className={`bg-white rounded-[2rem] border p-6 shadow-sm transition-all ${isCompleted ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-100'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{gInfo.icon}</span>
                  <div>
                    <h3 className="font-black text-slate-800">{gInfo.label}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {goal.startValue} → {goal.targetValue} {gInfo.unit}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">🏆 Hoàn thành</span>
                  ) : (
                    <>
                      <button onClick={() => handleOpenEditForm(goal)} className="text-blue-400 hover:text-blue-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-blue-50 transition-all">✏️ Sửa</button>
                      <button onClick={() => handleCancelGoal(goal.id)} className="text-rose-400 hover:text-rose-600 text-xs font-bold px-2 py-1 rounded-lg hover:bg-rose-50 transition-all">✕ Hủy</button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all duration-700 ${bgColor}`} style={{ width: `${Math.min(100, goal.progress)}%` }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-500">{goal.progress}%</span>
                <span className="text-[10px] text-slate-400">{goal.startDate} → {goal.targetDate}</span>
              </div>
            </div>
          );
        })}
        {activeGoals.length === 0 && (
          <div className="col-span-full p-16 text-center text-slate-400 font-medium italic bg-white rounded-[2rem] border border-slate-100">
            Chưa có mục tiêu nào. Hãy tạo mục tiêu sức khỏe đầu tiên của bạn! 🎯
          </div>
        )}
      </div>
    </div>
  );
});

GoalTracking.displayName = 'GoalTracking';
export default GoalTracking;