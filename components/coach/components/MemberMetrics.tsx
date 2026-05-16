import React, { useState, useEffect, useMemo, memo } from 'react';
import { User, HealthMetric } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface MemberMetricsProps {
  currentUser: User;
  selectedMember: User;
  onOpenChat: () => void;
}

const MemberMetrics: React.FC<MemberMetricsProps> = memo(({ currentUser, selectedMember, onOpenChat }) => {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const selectedMemberId = (selectedMember as any).id || (selectedMember as any)._id;
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        console.log(`[MemberMetrics] Fetching metrics for ${selectedMember.fullName}...`);
        const data = await Database.getMetrics(selectedMemberId);
        if (data) {
          setMetrics(data);
          console.log(`[MemberMetrics] Loaded ${data.length} metrics`);
        }
      } catch (error) {
        console.error('[MemberMetrics] Error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMetrics();
  }, [selectedMemberId, selectedMember.fullName]);

  const latestMetric = metrics.length > 0 ? metrics[0] : null;

  const metricCards = useMemo(() => {
    if (!latestMetric) return [];
    return [
      { label: 'Cân nặng', value: latestMetric.weight, unit: 'kg', icon: '⚖️', color: 'bg-emerald-50 text-emerald-700' },
      { label: 'Mỡ cơ thể', value: latestMetric.bodyFat, unit: '%', icon: '🔥', color: 'bg-rose-50 text-rose-700' },
      { label: 'Cơ bắp', value: latestMetric.muscleMass, unit: 'kg', icon: '💪', color: 'bg-blue-50 text-blue-700' },
      { label: 'Nước', value: latestMetric.waterPercent, unit: '%', icon: '💧', color: 'bg-cyan-50 text-cyan-700' },
      { label: 'Mỡ nội tạng', value: latestMetric.visceralFat, unit: '', icon: '⚠️', color: 'bg-amber-50 text-amber-700' },
      { label: 'Năng lượng', value: latestMetric.energy, unit: 'kcal', icon: '⚡', color: 'bg-orange-50 text-orange-700' },
    ];
  }, [latestMetric]);

  return (
    <div className="space-y-4">
      {/* Member Info Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-100">
              <img 
                src={selectedMember.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedMember.username}&backgroundColor=f8fafc`} 
                alt={selectedMember.fullName} 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">{selectedMember.fullName}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                @{selectedMember.username} • {selectedMember.gender} • {selectedMember.height}cm
              </p>
              <div className="flex gap-1 mt-1">
                {(selectedMember.healthGoals || []).map(goal => (
                  <span key={goal} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider">
                    {goal}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={onOpenChat}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
          >
            💬 Chat
          </button>
        </div>
      </div>

      {/* Latest Metrics */}
      {isLoading ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
          <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-bold mt-3">Đang tải chỉ số...</p>
        </div>
      ) : latestMetric ? (
        <>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                📊 Chỉ số mới nhất - {latestMetric.date}
              </h4>
              <span className="text-[10px] text-slate-400 font-bold">{metrics.length} lần đo</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {metricCards.map(card => (
                <div key={card.label} className={`rounded-xl p-3 ${card.color}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{card.icon}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider opacity-70">{card.label}</span>
                  </div>
                  <p className="text-lg font-black">
                    {card.value}
                    <span className="text-xs font-bold ml-0.5">{card.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Metric History */}
          {metrics.length > 1 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
                📈 Lịch sử chỉ số (5 gần nhất)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 font-black uppercase tracking-wider border-b border-slate-50">
                      <th className="text-left py-2 pr-3">Ngày</th>
                      <th className="text-right px-2">⚖️ kg</th>
                      <th className="text-right px-2">🔥 %</th>
                      <th className="text-right px-2">💪 kg</th>
                      <th className="text-right px-2">💧 %</th>
                      <th className="text-right px-2">⚠️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.slice(0, 5).map(m => (
                      <tr key={(m as any).id || (m as any)._id} className="border-b border-slate-50 text-slate-600 font-bold">
                        <td className="py-2 pr-3 text-slate-400">{m.date}</td>
                        <td className="text-right px-2">{m.weight}</td>
                        <td className="text-right px-2">{m.bodyFat}</td>
                        <td className="text-right px-2">{m.muscleMass}</td>
                        <td className="text-right px-2">{m.waterPercent}</td>
                        <td className="text-right px-2">{m.visceralFat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <p className="text-slate-400 font-bold text-sm">Hội viên chưa có chỉ số nào</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-3">
        <button
          onClick={onOpenChat}
          className="flex-1 py-3 bg-white border-2 border-emerald-100 text-emerald-700 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-emerald-50 transition-all active:scale-95"
        >
          💬 Nhắn tin
        </button>
      </div>
    </div>
  );
});

MemberMetrics.displayName = 'MemberMetrics';
export default MemberMetrics;