
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { HealthMetric, User, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import StatCards from './StatCards.tsx';
import BodyCompositionPie from './BodyCompositionPie.tsx';
import TrendChart from './TrendChart.tsx';

interface DashboardProps {
  user: User;
  users: User[];
  onAddMetric: () => void;
  refreshTrigger?: number;
}

const AVAILABLE_METRICS = [
  { key: 'weight', label: 'Cân nặng (kg)', color: '#059669', inverse: true, icon: '⚖️' },
  { key: 'bodyFat', label: 'Mỡ cơ thể (%)', color: '#ef4444', inverse: true, icon: '🔥' },
  { key: 'waterPercent', label: 'Nước (%)', color: '#0ea5e9', inverse: false, icon: '💧' },
  { key: 'muscleMass', label: 'Lượng cơ (kg)', color: '#3b82f6', inverse: false, icon: '💪' },
  { key: 'balanceIndex', label: 'Cân đối', color: '#8b5cf6', inverse: false, icon: '💎' },
  { key: 'bioAge', label: 'Tuổi sinh học', color: '#ec4899', inverse: true, icon: '⏳' },
  { key: 'visceralFat', label: 'Mỡ nội tạng', color: '#f59e0b', inverse: true, icon: '⚠️' },
  { key: 'boneMinerals', label: 'Khoáng chất (kg)', color: '#64748b', inverse: false, icon: '🦴' },
  { key: 'energy', label: 'Năng Lượng (kcal)', color: '#f97316', inverse: false, icon: '⚡' },
];

const Dashboard: React.FC<DashboardProps> = memo(({ user, users, onAddMetric, refreshTrigger }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<string[]>(['weight', 'bodyFat', 'muscleMass']);

  useEffect(() => {
    Database.getMetrics(selectedUserId).then(data => setMetrics(data || []));
  }, [selectedUserId, refreshTrigger]);

  const sortedMetrics = useMemo(() => [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [metrics]);
  const latestMetric = sortedMetrics[0] || null;
  const prevMetric = sortedMetrics[1] || null;

  const toggleMetric = useCallback((key: string) => {
    setSelectedMetricKeys(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const filteredMetrics = useMemo(() => {
    const cutoff = new Date();
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else if (timeRange === '14d') cutoff.setDate(cutoff.getDate() - 14);
    else if (timeRange === '1m') cutoff.setMonth(cutoff.getMonth() - 1);
    else return [...metrics].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return metrics.filter(m => new Date(m.date) >= cutoff).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Trung tâm điều khiển</h2>
          {user.role !== UserRole.MEMBER ? (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-slate-500 font-medium">Hội viên:</span>
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-xl border-none text-sm outline-none ring-1 ring-emerald-100">
                {users.map(u => <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>{u.fullName}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-slate-500 font-medium">Chào {user.fullName}! Mục tiêu: <span className="text-emerald-600 font-bold">{(user.healthGoals || []).join(', ') || 'Chưa đặt mục tiêu'}</span></p>
          )}
        </div>
        <button onClick={onAddMetric} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-emerald-100 font-bold hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all">+ Cập nhật chỉ số</button>
      </div>

      <StatCards latestMetric={latestMetric} prevMetric={prevMetric} configs={AVAILABLE_METRICS} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <BodyCompositionPie latestMetric={latestMetric} />
        <TrendChart 
          metrics={filteredMetrics} 
          timeRange={timeRange} 
          setTimeRange={setTimeRange} 
          selectedMetricKeys={selectedMetricKeys} 
          toggleMetric={toggleMetric} 
          configs={AVAILABLE_METRICS} 
        />
      </div>
    </div>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard;
