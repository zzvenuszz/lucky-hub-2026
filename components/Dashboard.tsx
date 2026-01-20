
import React, { useState, useMemo, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart, Pie, Cell 
} from 'recharts';
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

  const bodyCompData = useMemo(() => {
    if (!latestMetric) return [];
    // Tính toán tương đối để hiển thị biểu đồ tròn
    // Lưu ý: Các chỉ số này có thể không tổng thành 100% nhưng ta biểu diễn tỉ lệ tương quan
    return [
      { name: 'Cơ bắp', value: latestMetric.muscleMass || 0, color: '#059669' },
      { name: 'Mỡ cơ thể', value: (latestMetric.weight * (latestMetric.bodyFat / 100)) || 0, color: '#f43f5e' },
      { name: 'Nước', value: (latestMetric.weight * (latestMetric.waterPercent / 100)) || 0, color: '#0ea5e9' },
    ];
  }, [latestMetric]);

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
          <h3 className="font-bold text-slate-700 mb-2 w-full text-center">Cấu trúc cơ thể</h3>
          {latestMetric ? (
            <div className="w-full h-[250px] relative flex flex-col items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    <filter id="shadow" height="130%">
                      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                      <feOffset dx="2" dy="4" result="offsetblur" />
                      <feComponentTransfer>
                        <feFuncA type="linear" slope="0.2" />
                      </feComponentTransfer>
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <Pie
                    data={bodyCompData}
                    cx="50%" cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    filter="url(#shadow)"
                  >
                    {bodyCompData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Khối lượng']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className="text-2xl font-black text-slate-800">{latestMetric.weight}<span className="text-xs ml-0.5">kg</span></div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Tổng cân</div>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {bodyCompData.map(item => (
                  <div key={item.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="h-[250px] flex items-center justify-center text-slate-400 italic">Chưa có dữ liệu đo lường</div>}
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
