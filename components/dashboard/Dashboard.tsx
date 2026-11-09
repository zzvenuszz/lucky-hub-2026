
import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { HealthMetric, User } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { cacheManager } from '../../utils/cacheManager.ts';
import StatCards from './StatCards.tsx';
import BodyCompositionPie from './BodyCompositionPie.tsx';
import TrendChart from './TrendChart.tsx';
import GoalTracking from '../goals/GoalTracking.tsx';
import LoadingButton from '../system/LoadingButton.tsx';
import SponsorTreeSection from './SponsorTreeSection.tsx';

interface DashboardProps {
  user: User;
  users: User[];
  onAddMetric: (targetId?: string) => void;
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
  const canViewSponsorTree = Boolean((user as any).permissions?.includes('members:sponsor-tree:view'));

  useEffect(() => {
    const cacheKey = `metrics_${selectedUserId}`;
    
    // Nếu có refreshTrigger > 0 (vừa lưu dữ liệu mới), bỏ qua cache, fetch từ API luôn
    if (refreshTrigger && refreshTrigger > 0) {
      Database.getMetrics(selectedUserId).then(data => {
        if (data) {
          cacheManager.set(cacheKey, data, 5); // Cache for 5 minutes
          setMetrics(data);
        }
      });
      return;
    }

    // Check cache first (chỉ khi không có refreshTrigger, tức lần mount đầu tiên)
    const cachedMetrics = cacheManager.get<HealthMetric[]>(cacheKey);
    if (cachedMetrics) {
      console.log(`[Dashboard] Using cached metrics for ${selectedUserId}`);
      setMetrics(cachedMetrics);
      return;
    }

    // Fetch from DB if cache miss
    Database.getMetrics(selectedUserId).then(data => {
      if (data) {
        cacheManager.set(cacheKey, data, 5); // Cache for 5 minutes
        setMetrics(data);
      }
    });
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
      <div className="rounded-[32px] border border-emerald-100 bg-gradient-to-r from-white via-emerald-50 to-teal-50 p-5 shadow-[0_20px_50px_rgba(16,185,129,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              <span>✨</span>
              <span>Trung tâm sức khỏe</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-800 sm:text-[2rem]">Thống kê & mục tiêu</h2>
            {(user as any).permissions?.includes('metrics:view:any') ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-sm font-semibold text-slate-500">Hội viên:</span>
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="w-full rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-sm font-bold text-emerald-700 shadow-sm outline-none ring-0 transition focus:border-emerald-300 sm:w-auto">
                  {users.map(u => <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>{u.fullName}</option>)}
                </select>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600 sm:text-base">Chào {user.fullName}! Mục tiêu của bạn: <span className="font-black text-emerald-600">{(user.healthGoals || []).join(', ') || 'Chưa đặt mục tiêu'}</span></p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-left shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Cập nhật gần nhất</div>
              <div className="mt-1 text-sm font-black text-slate-800">{latestMetric ? new Date(latestMetric.date).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu'}</div>
            </div>
            <LoadingButton onClick={() => onAddMetric(selectedUserId)} variant="primary" size="md" className="!shadow-lg !shadow-emerald-100">
              + Cập nhật chỉ số
            </LoadingButton>
          </div>
        </div>
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

      {/* Goals Section */}
      {metrics.length > 0 && (
        <div className="mt-8">
          <GoalTracking currentUser={user} refreshTrigger={refreshTrigger} />
        </div>
      )}

      {canViewSponsorTree && <SponsorTreeSection userId={selectedUserId} />}
    </div>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard;
