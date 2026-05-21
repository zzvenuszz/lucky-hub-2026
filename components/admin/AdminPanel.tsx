
import React, { useState, useEffect } from 'react';
import { User, AIKnowledge, AIRule, AuditLog } from '../../types.ts';
import { Database } from '../../services/database.ts';

// Import sub-modules
import UserManagement from './UserManagement.tsx';
import MetricAdmin from './MetricAdmin.tsx';
import AITraining from './AITraining.tsx';
import AuditLogs from './AuditLogs.tsx';
import GeminiKeyManager from './ai/GeminiKeyManager.tsx';
import GroupManager from './groups/GroupManager.tsx';
import NutritionGroupManager from './nutrition/NutritionGroupManager.tsx';
import ChatGroupManager from './nutrition/ChatGroupManager.tsx';

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'ai' | 'audit' | 'config' | 'groups' | 'ndd' | 'chatgroups'>('users');
  const [nutritionGroups, setNutritionGroups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

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
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden min-h-[75vh] flex flex-col">
      {/* Header Điều hướng Tab - Responsive */}
      <div className="flex flex-col md:flex-row bg-slate-50/50 p-3 md:p-4 m-3 md:m-6 rounded-2xl md:rounded-3xl border border-slate-100 gap-4 shrink-0">
        <div className="flex flex-wrap md:flex-nowrap bg-white/50 p-1 rounded-xl md:rounded-2xl gap-1 no-scrollbar">
          <button 
            onClick={() => setActiveTab('users')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'users' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">👥</span>
            Hội viên
          </button>
          <button 
            onClick={() => setActiveTab('metrics')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'metrics' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">📊</span>
            Chỉ số
          </button>
          <button 
            onClick={() => setActiveTab('ai')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'ai' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">🤖</span>
            Huấn luyện AI
          </button>
          <button 
            onClick={() => setActiveTab('config')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'config' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">⚙️</span>
            Cấu hình
          </button>
          <button 
            onClick={() => setActiveTab('groups')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'groups' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">🔐</span>
            Nhóm & Q. Hạn
          </button>
          <button 
            onClick={() => setActiveTab('audit')} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'audit' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">📋</span>
            Nhật ký
          </button>
          <button 
            onClick={() => {
              setActiveTab('ndd');
              Database.getAllNutritionGroups().then(setNutritionGroups).catch(() => {});
            }} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'ndd' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">🏥</span>
            NDD
          </button>
          <button 
            onClick={() => {
              setActiveTab('chatgroups');
              Database.getAllNutritionGroups().then(setNutritionGroups).catch(() => {});
            }} 
            className={`flex-1 min-w-0 px-2 md:px-3 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all text-center ${activeTab === 'chatgroups' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <span className="block md:hidden text-base mb-0.5">👥</span>
            Nhóm Chat
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-4 md:px-8 pb-4 md:pb-8 flex-grow overflow-y-auto no-scrollbar">
        {activeTab === 'users' && (
          <UserManagement users={users} onRefresh={onRefresh} />
        )}

        {activeTab === 'metrics' && (
          <MetricAdmin users={users} onRefresh={onRefresh} />
        )}

        {activeTab === 'ai' && (
          <AITraining knowledge={knowledge} rules={rules} onRefresh={onRefresh} />
        )}

        {activeTab === 'config' && (
          <div className="animate-in fade-in">
            <GeminiKeyManager />
          </div>
        )}

        {activeTab === 'groups' && (
          <GroupManager users={users} onRefresh={onRefresh} />
        )}

        {activeTab === 'audit' && (
          <AuditLogs logs={auditLogs} />
        )}

        {activeTab === 'ndd' && (
          <NutritionGroupManager users={users} onRefresh={onRefresh} />
        )}

        {activeTab === 'chatgroups' && (
          <ChatGroupManager users={users} nutritionGroups={nutritionGroups} onRefresh={onRefresh} />
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
