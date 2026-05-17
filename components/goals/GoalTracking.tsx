import React, { useState, useEffect, useCallback, memo } from 'react';
import { User } from '../../types.ts';
import { Database } from '../../services/database.ts';

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

const GoalTracking: React.FC<GoalTrackingProps> = memo(({ currentUser, refreshTrigger }) => {
  const currentUid = (currentUser as any).id || (currentUser as any)._id;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newGoal, setNewGoal] = useState({ type: 'weight', targetValue: 60, startValue: 0, startDate: '', targetDate: '' });

  const fetchGoals = useCallback(async () => {
    try {
      const resp = await fetch(`/api/goals/${currentUid}`);
      const data = await resp.json();
      setGoals(data || []);
      console.log(`[Goals] Loaded ${data?.length || 0} goals`);
    } catch (err: any) {
      console.error('[Goals] Fetch error:', err);
    }
  }, [currentUid]);

  useEffect(() => { fetchGoals(); }, [fetchGoals, refreshTrigger]);

  const handleCreateGoal = async () => {
    if (!newGoal.startDate || !newGoal.targetDate) return alert('Vui lòng chọn ngày');
    try {
      const resp = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newGoal, userId: currentUid })
      });
      if (resp.ok) {
        setShowForm(false);
        fetchGoals();
        // Recalculate progress immediately
        await fetch(`/api/goals/recalculate/${currentUid}`, { method: 'POST' });
      }
    } catch (err: any) {
      console.error('[Goals] Create error:', err);
    }
  };

  const handleCancelGoal = async (goalId: string) => {
    try {
      await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      fetchGoals();
    } catch (err: any) {
      console.error('[Goals] Cancel error:', err);
    }
  };

  const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'completed');
  const info = (type: string) => GOAL_TYPES[type] || { label: type, unit: '', color: 'slate', icon: '📊' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Mục tiêu sức khỏe</h2>
          <p className="text-slate-400 text-xs font-medium mt-1 uppercase tracking-widest">Theo dõi tiến độ hoàn thành</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-100 font-bold hover:bg-emerald-700 transition-all">
          {showForm ? '✕ Đóng' : '+ Thêm mục tiêu'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-[2rem] border border-emerald-100 shadow-sm p-6 space-y-4 animate-in slide-in-from-top-2">
          <h3 className="font-bold text-slate-700">📋 Mục tiêu mới</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select value={newGoal.type} onChange={e => setNewGoal({...newGoal, type: e.target.value})} className="px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm">
              {Object.entries(GOAL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label} ({v.unit})</option>
              ))}
            </select>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Giá trị hiện tại</label>
              <input type="number" value={newGoal.startValue} onChange={e => setNewGoal({...newGoal, startValue: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Mục tiêu</label>
              <input type="number" value={newGoal.targetValue} onChange={e => setNewGoal({...newGoal, targetValue: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Ngày bắt đầu</label>
              <input type="date" value={newGoal.startDate} onChange={e => setNewGoal({...newGoal, startDate: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase">Ngày kết thúc</label>
              <input type="date" value={newGoal.targetDate} onChange={e => setNewGoal({...newGoal, targetDate: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-sm" />
            </div>
          </div>
          <button onClick={handleCreateGoal} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs">Tạo mục tiêu</button>
        </div>
      )}

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
                {isCompleted ? (
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">🏆 Hoàn thành</span>
                ) : goal.status === 'cancelled' ? (
                  <span className="bg-slate-100 text-slate-400 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">Đã hủy</span>
                ) : (
                  <button onClick={() => handleCancelGoal(goal.id)} className="text-rose-400 hover:text-rose-600 text-xs font-bold">✕ Hủy</button>
                )}
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