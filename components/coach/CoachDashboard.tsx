import React, { useState, useEffect, useCallback, memo } from 'react';
import { User, HealthMetric, ChatSession, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import MemberList from './components/MemberList.tsx';
import MemberMetrics from './components/MemberMetrics.tsx';
import CoachChat from './components/CoachChat.tsx';

interface CoachDashboardProps {
  currentUser: User;
}

type CoachTab = 'members' | 'chat';

const CoachDashboard: React.FC<CoachDashboardProps> = memo(({ currentUser }) => {
  const [members, setMembers] = useState<User[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CoachTab>('members');
  const [isLoading, setIsLoading] = useState(true);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  // Load danh sách MEMBER từ API
  useEffect(() => {
    const fetchMembers = async () => {
      setIsLoading(true);
      try {
        console.log('[CoachDashboard] Fetching members...');
        const allUsers = await Database.getUsers();
        if (allUsers) {
          const memberUsers = allUsers.filter(u => u.role === UserRole.MEMBER);
          setMembers(memberUsers);
          console.log(`[CoachDashboard] Loaded ${memberUsers.length} members`);
        }
      } catch (error) {
        console.error('[CoachDashboard] Error fetching members:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const handleSelectMember = useCallback((userId: string) => {
    setSelectedMemberId(userId);
    setActiveTab('members');
  }, []);

  const handleOpenChat = useCallback((userId: string) => {
    setSelectedMemberId(userId);
    setActiveTab('chat');
  }, []);

  const selectedMember = selectedMemberId 
    ? members.find(m => (m as any).id === selectedMemberId || (m as any)._id === selectedMemberId)
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 rounded-[2.5rem] p-8 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
            🎯
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Dashboard Huấn luyện viên</h2>
            <p className="text-emerald-100 text-sm font-bold mt-1">
              Quản lý {members.length} hội viên
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'members'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          📊 Chỉ số hội viên
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
            activeTab === 'chat'
              ? 'bg-white text-emerald-600 shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          💬 Chat hội viên
        </button>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Member List - Left column */}
        <div className="lg:col-span-1">
          {isLoading ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
              <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-bold mt-3">Đang tải danh sách...</p>
            </div>
          ) : (
            <MemberList
              members={members}
              selectedMemberId={selectedMemberId}
              onSelectMember={handleSelectMember}
            />
          )}
        </div>

        {/* Detail Panel - Right column */}
        <div className="lg:col-span-2">
          {!selectedMember ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
              <div className="text-5xl mb-4">👈</div>
              <p className="text-slate-400 font-bold text-sm">
                Chọn một hội viên từ danh sách bên trái để xem chi tiết
              </p>
            </div>
          ) : activeTab === 'chat' ? (
            <CoachChat
              currentUser={currentUser}
              selectedMember={selectedMember}
              onClose={() => setSelectedMemberId(null)}
            />
          ) : (
            <MemberMetrics
              currentUser={currentUser}
              selectedMember={selectedMember}
              onOpenChat={() => handleOpenChat(selectedMemberId!)}
            />
          )}
        </div>
      </div>
    </div>
  );
});

CoachDashboard.displayName = 'CoachDashboard';
export default CoachDashboard;