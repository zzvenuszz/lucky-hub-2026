import React, { memo } from 'react';
import { User } from '../../../types.ts';

interface MemberListProps {
  members: User[];
  selectedMemberId: string | null;
  onSelectMember: (userId: string) => void;
}

const MemberList: React.FC<MemberListProps> = memo(({ members, selectedMemberId, onSelectMember }) => {
  if (members.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center border border-slate-100 shadow-sm">
        <p className="text-slate-400 font-bold text-sm">Chưa có hội viên nào</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">
          📋 Danh sách hội viên ({members.length})
        </h3>
      </div>
      <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
        {members.map(member => {
          const uid = (member as any).id || (member as any)._id;
          const avatarUrl = member.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${member.username}&backgroundColor=f8fafc`;
          return (
            <button
              key={uid}
              onClick={() => onSelectMember(uid)}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all hover:bg-emerald-50 ${
                selectedMemberId === uid ? 'bg-emerald-50 ring-2 ring-emerald-500 ring-inset' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-slate-100 shrink-0">
                <img src={avatarUrl} alt={member.fullName} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{member.fullName}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">@{member.username}</p>
              </div>
              <span className="text-lg">📊</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

MemberList.displayName = 'MemberList';
export default MemberList;