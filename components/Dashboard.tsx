
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HealthMetric, User, UserRole } from '../types';
import { Database } from '../services/database';

interface DashboardProps {
  user: User;
  users: User[]; // Danh sách tất cả user để HLV chọn
  onAddMetric: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, users, onAddMetric }) => {
  const [selectedUserId, setSelectedUserId] = useState(user.id);
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [timeRange, setTimeRange] = useState('1w');
  const [selectedMetrics, setSelectedMetrics] = useState({
    weight: true, bodyFat: true, waterPercent: true, muscleMass: true, visceralFat: false, energy: false
  });

  useEffect(() => {
    const load = async () => {
      const data = await Database.getMetrics(selectedUserId);
      setMetrics(data || []);
    };
    load();
  }, [selectedUserId]);

  const selectedUserInfo = useMemo(() => users.find(u => u.id === selectedUserId) || user, [users, selectedUserId, user]);

  const latestMetric = useMemo(() => {
    if (metrics.length === 0) return null;
    return [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [metrics]);

  const filteredMetrics = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    if (timeRange === '1w') cutoff.setDate(now.getDate() - 7);
    else if (timeRange === '2w') cutoff.setDate(now.getDate() - 14);
    else if (timeRange === '1m') cutoff.setMonth(now.getMonth() - 1);
    else if (timeRange === '3m') cutoff.setMonth(now.getMonth() - 3);
    else if (timeRange === '6m') cutoff.setMonth(now.getMonth() - 6);
    else if (timeRange === '1y') cutoff.setFullYear(now.getFullYear() - 1);
    else if (timeRange === '2y') cutoff.setFullYear(now.getFullYear() - 2);
    else if (timeRange === '5y') cutoff.setFullYear(now.getFullYear() - 5);

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
                {users.map(u => <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>)}
              </select>
            </div>
          ) : (
            <p className="text-slate-500">Chào {user.fullName}! Mục tiêu: <span className="text-emerald-600 font-semibold">{user.healthGoal}</span></p>
          )}
        </div>
        <button onClick={onAddMetric} className="bg-emerald-600 text-white px-6 py-2 rounded-xl shadow-lg font-bold">+ Cập nhật chỉ số</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tỉ lệ cơ thể */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-6 w-full">Tỉ lệ cơ thể ({selectedUserInfo.fullName})</h3>
          {latestMetric ? (
            <div className="relative w-full aspect-square max-w-[240px] bg-slate-50 rounded-[3rem] flex items-center justify-center overflow-hidden border-8 border-white shadow-inner">
               <div className="z-10 text-center">
                  <div className="text-5xl font-black text-emerald-600">{latestMetric.bodyFat}<span className="text-xl">%</span></div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Lượng mỡ</div>
                  <div className="mt-6 text-2xl font-bold text-slate-700">{latestMetric.muscleMass}kg</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Cơ bắp</div>
               </div>
               <div className="absolute bottom-0 left-0 right-0 h-3 bg-emerald-100">
                  <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(latestMetric.muscleMass / latestMetric.weight) * 100}%` }}></div>
               </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 italic">Chưa có dữ liệu</div>
          )}
        </div>

        {/* Biểu đồ biến động */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h3 className="font-bold text-slate-700">Biến động chỉ số</h3>
            <div className="flex flex-wrap gap-1">
              {['1w', '2w', '1m', '3m', '6m', '1y', '2y', '5y'].map(range => (
                <button 
                  key={range} onClick={() => setTimeRange(range)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${timeRange === range ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[280px] w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredMetrics}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={9} tickFormatter={s => s.split('-').slice(1).reverse().join('/')} />
                <YAxis fontSize={9} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                {selectedMetrics.weight && <Line type="monotone" dataKey="weight" name="Cân nặng" stroke="#059669" strokeWidth={3} dot={{ r: 4 }} />}
                {selectedMetrics.bodyFat && <Line type="monotone" dataKey="bodyFat" name="Mỡ %" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />}
                {selectedMetrics.waterPercent && <Line type="monotone" dataKey="waterPercent" name="Nước %" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />}
                {selectedMetrics.muscleMass && <Line type="monotone" dataKey="muscleMass" name="Cơ bắp" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />}
                {selectedMetrics.visceralFat && <Line type="monotone" dataKey="visceralFat" name="Mỡ NT" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} />}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {Object.keys(selectedMetrics).map(key => (
              <label key={key} className="flex items-center space-x-1 cursor-pointer bg-slate-50 p-2 rounded-xl border border-slate-100">
                <input type="checkbox" checked={(selectedMetrics as any)[key]} onChange={() => setSelectedMetrics(prev => ({...prev, [key]: !(prev as any)[key]}))} className="accent-emerald-600 w-3 h-3" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">{key}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
