import React, { useState, useEffect, useCallback, memo } from 'react';
import { Database } from '../../../services/database.ts';

const SystemNDDOverview: React.FC = () => {
  const [groups, setGroups] = useState<any[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await Database.getAllNutritionGroups();
      setGroups(data || []);
    } catch (err) {
      console.error('[SystemNDDOverview] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <span className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">🌐 Hệ thống NDD</h2>
        <span className="text-[10px] text-slate-400 font-bold">{groups.length} NDD</span>
      </div>

      <div className="space-y-3">
        {groups.map((group: any) => {
          const gid = group.id || group._id;
          const isExpanded = expandedGroup === gid;
          const members = group.members || [];
          const pendingCount = group.pendingMembers?.length || 0;
          const coOwners = group.coOwners || [];

          return (
            <div key={gid} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden hover:border-emerald-300 transition-all">
              <div
                className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpandedGroup(isExpanded ? null : gid)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">🏥</div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-800 truncate">{group.name}</h3>
                    <p className="text-[10px] text-slate-400">
                      Chủ: {group.ownerName || 'N/A'} • {members.length} hội viên
                      {coOwners.length > 0 && ` • ${coOwners.length} đồng vận hành`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pendingCount > 0 && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[8px] font-black">
                      ⏳ {pendingCount}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${group.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {group.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-slate-300 text-lg transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>▼</span>
                </div>
              </div>

              {/* Expanded members */}
              {isExpanded && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <div className="pt-4 space-y-3">
                    {/* Basic Info */}
                    <div className="grid grid-cols-3 gap-3 text-[11px] bg-slate-50 rounded-2xl p-3">
                      <div>
                        <span className="text-slate-400">Địa chỉ:</span>
                        <span className="ml-1 font-bold text-slate-700">{group.address || 'Chưa có'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Chủ vận hành:</span>
                        <span className="ml-1 font-bold text-emerald-600">{group.ownerName || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Đồng vận hành:</span>
                        <span className="ml-1 font-bold text-blue-600">
                          {coOwners.length > 0 ? coOwners.map((c: any) => c.fullName).join(', ') : 'Không có'}
                        </span>
                      </div>
                    </div>

                    {/* Member List */}
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                        Thành viên ({members.length})
                      </p>
                      {members.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">Chưa có thành viên</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                          {members.map((m: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 overflow-hidden shrink-0">
                                <img src={m.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${m.fullName}`} className="w-full h-full object-cover" alt="" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate">{m.fullName}</p>
                                <p className="text-[9px] text-slate-400 truncate">@{m.username} • {m.role}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pending members */}
                    {group.pendingMembers?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider mb-2">
                          ⏳ Yêu cầu chờ duyệt ({group.pendingMembers.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {group.pendingMembers.map((p: any, idx: number) => (
                            <span key={idx} className="px-2 py-1 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-medium">
                              {p.userId?.fullName || 'Unknown'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="p-16 text-center text-slate-300 italic uppercase text-[10px] font-black tracking-widest">
            Chưa có NDD nào trong hệ thống
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(SystemNDDOverview);