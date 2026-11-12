
import React, { useState, useEffect } from 'react';
import { User, AIKnowledge, AIRule, AuditLog } from '../../types.ts';
import { Database } from '../../services/database.ts';

// Import sub-modules
import UserManagement from './UserManagement.tsx';
import AITraining from './AITraining.tsx';
import AuditLogs from './AuditLogs.tsx';
import GroupManager from './groups/GroupManager.tsx';
import NutritionGroupManager from './nutrition/NutritionGroupManager.tsx';
import BranchManager from './nutrition/BranchManager.tsx';

// Import new AI admin components
import AIProviderPanel from './ai/AIProviderPanel.tsx';
import AITaskMappingPanel from './ai/AITaskMappingPanel.tsx';
import AILogPanel from './ai/AILogPanel.tsx';

// Import System Settings
import SystemSettings from './SystemSettings.tsx';

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'ai' | 'audit' | 'groups' | 'ndd' | 'systemndd' | 'ai-providers' | 'ai-tasks' | 'ai-logs' | 'system-settings'>('users');
  const [nutritionGroups, setNutritionGroups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const permissions = (currentUser as any).permissions || [];
  const canViewNdd = permissions.includes('ndd:manage') || permissions.includes('ndd:admin');
  const canAdminNdd = permissions.includes('ndd:admin');
  const canViewBranches = permissions.includes('ndd:system') || permissions.includes('ndd:branch:admin');
  const canAdminBranches = permissions.includes('ndd:branch:admin');

  // Tải nhật ký hệ thống khi chuyển sang tab Audit
  useEffect(() => {
    try {
      if (activeTab === 'audit') {
        console.log(`[AdminPanel] Loading audit logs`);
        Database.getAuditLogs().then(logs => {
          setAuditLogs(logs);
          console.log(`[AdminPanel] Loaded ${logs.length} audit logs`);
        });
      } else {
        console.log(`[AdminPanel] Switched to tab: ${activeTab}`);
      }
    } catch (error) {
      console.error(`[AdminPanel] Error in useEffect:`, error);
    }
  }, [activeTab]);

  return (
    <div className="min-h-[75vh] overflow-visible rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
      {/* Header Điều hướng Tab - Responsive */}
      <div className="sticky top-[60px] z-30 border-b border-slate-200 bg-slate-50/95 p-3 backdrop-blur-md md:top-[72px] md:p-4">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-1.5 shadow-sm">
          <button
            onClick={() => setActiveTab('users')} 
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'users' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">👥</span>
            <span className="hidden md:inline">Hội viên</span>
          </button>
          <button
            onClick={() => setActiveTab('groups')} 
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'groups' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">🔐</span>
            <span className="hidden md:inline">Nhóm</span>
          </button>
          {canViewNdd && <button
            onClick={() => {
              setActiveTab('ndd');
              Database.getAllNutritionGroups().then(setNutritionGroups).catch(() => {});
            }} 
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'ndd' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">🏥</span>
            <span className="hidden md:inline">NDD</span>
          </button>}
          {canViewBranches && <button
            onClick={() => setActiveTab('systemndd')} 
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'systemndd' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">🌐</span>
            <span className="hidden md:inline">Nhánh NDD</span>
          </button>}
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'ai' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">🤖</span>
            <span className="hidden md:inline">DẠY AI</span>
          </button>
          <button
            onClick={() => setActiveTab('ai-providers')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'ai-providers' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">🔑</span>
            <span className="hidden md:inline">AI PROVIDER</span>
          </button>
          <button
            onClick={() => setActiveTab('ai-tasks')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'ai-tasks' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">📋</span>
            <span className="hidden md:inline">Task</span>
          </button>
          <button
            onClick={() => setActiveTab('ai-logs')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'ai-logs' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">📊</span>
            <span className="hidden md:inline">Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'audit' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">📜</span>
            <span className="hidden md:inline">Nhật ký</span>
          </button>
          <button
            onClick={() => setActiveTab('system-settings')}
            className={`flex-none w-auto rounded-xl px-2 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.15em] transition-all md:px-3 ${activeTab === 'system-settings' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <span className="block text-base">⚙️</span>
            <span className="hidden md:inline">Cài đặt</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow overflow-y-auto bg-slate-50/40 p-4 md:p-6">
        {activeTab === 'users' && (
          <UserManagement users={users} onRefresh={onRefresh} canManageMemberLevels={(currentUser as any).permissions?.includes('members:level:manage:any') || false} />
        )}

        {activeTab === 'ai' && (
          <AITraining knowledge={knowledge} rules={rules} onRefresh={onRefresh} />
        )}

        {activeTab === 'groups' && (
          <GroupManager users={users} onRefresh={onRefresh} />
        )}

        {activeTab === 'audit' && (
          <AuditLogs logs={auditLogs} />
        )}

        {activeTab === 'ndd' && canViewNdd && (
          <NutritionGroupManager users={users} onRefresh={onRefresh} canAdmin={canAdminNdd} />
        )}

        {activeTab === 'systemndd' && canViewBranches && (
          <BranchManager canAdmin={canAdminBranches} />
        )}

        {activeTab === 'ai-providers' && (
          <AIProviderPanel />
        )}

        {activeTab === 'ai-tasks' && (
          <AITaskMappingPanel />
        )}

        {activeTab === 'ai-logs' && (
          <AILogPanel />
        )}

        {activeTab === 'system-settings' && (
          <SystemSettings currentUser={currentUser} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
