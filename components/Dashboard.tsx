
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HealthMetric, User, UserRole } from '../types.ts';
import { Database } from '../services/database.ts';

interface DashboardProps {
  user: User;
  users: User[];
  onAddMetric: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric }) => {
  const [selectedUserId, setSelectedUserId] = useState((user as any).id || (user as any)._id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('1w');

  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId]);

  const selectedUserInfo = useMemo(() => users.find(u => ((u as any).id || (u as any)._id) === selectedUserId) || user, [users, selectedUserId, user]);

  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [metrics]);

  const filteredMetrics = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    if (timeRange === '1w') cutoff.setDate(now.getDate() - 7);
    else if (timeRange === '1m') cutoff.setMonth(now.getMonth() - 1);
    else if (timeRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);

    return metrics
      .filter(m => new Date(m.date) >= cutoff)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [metrics, timeRange]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Lucky Hub Dashboard</h2>
          {user.role !== UserRole.MEMBER ? (
            <div className="mt-2 flex items-center space-x-2">
              <span className="text-sm text-slate-500">Đang xem:</span>
              <select 
                value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                className="bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-lg border-none text-sm outline-none"
              >
                {users.map(u => <option key={(u as any).id || (u as any)._id} value={(u as any).id || (u as any)._id}>{u.fullName}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-slate-500">Chào {user.fullName}! Mục tiêu: <span className="text-emerald-600 font-semibold">{user.healthGoal}</span></p>
          )}
        </div>
        <button onClick={onAddMetric} className="bg-emerald-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold hover:bg-emerald-700 transition-colors">+ Cập nhật chỉ số</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-6 w-full text-center">Tỉ lệ cơ thể</h3>
          {latestMetric ? (
            <div className="text-center">
              <div className="text-5xl font-black text-emerald-600">{latestMetric.bodyFat}%</div>
              <div className="text-xs text-slate-400 uppercase font-bold mt-2">Lượng mỡ hiện tại</div>
              <div className="mt-4 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-full">
                {selectedUserInfo.fullName}
              </div>
            </div>
          ) : <div className="text-slate-400 italic">Chưa có dữ liệu đo lường</div>}
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-700 text-sm">Biểu đồ xu hướng</h3>
            <div className="flex gap-1">
              {['1w', '1m', '1y'].map(r => (
                <button 
                  key={r} onClick={() => setTimeRange(r)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${timeRange === r ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="weight" name="Cân nặng (kg)" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="bodyFat" name="Tỉ lệ mỡ (%)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
