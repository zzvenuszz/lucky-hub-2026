import React, { useState, useEffect } from 'react';
import { User, AIKnowledge, AIRule, AuditLog } from '../types.ts';
import { Database } from '../services/database.ts';

// Import sub-modules
import UserManagement from './admin/UserManagement.tsx';
import MetricAdmin from './admin/MetricAdmin.tsx';
import AITraining from './admin/AITraining.tsx';
import AuditLogs from './admin/AuditLogs.tsx';
import GeminiConfig from './admin/config/GeminiConfig.tsx';

interface AdminPanelProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, users, knowledge, rules, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'metrics' | 'ai' | 'audit' | 'config'>('users');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  
  // Điều khiển Console debug log của hệ thống
  useEffect(() => {
    const consoleEl = document.getElementById('debug-console');
    if (consoleEl) {
      consoleEl.style.display = showConsole ? 'flex' : 'none';
    }
  }, [showConsole]);

  useEffect(() => {
    if (activeTab === 'audit') {
      Database.getAuditLogs().then(logs => setAuditLogs(logs || []));
    }
  }, [activeTab]);

  const tabs = [
    { id: 'users', label: '👥 Hội viên', icon: '👤' },
    { id: 'metrics', label: '📈 Chỉ số', icon: '📊' },
    { id: 'ai', label: '🧠 Huấn luyện AI', icon: '🍀' },
    { id: 'audit', label: '📜 Nhật ký', icon: '📝' },
    { id: 'config', label: '⚙️ Cấu hình', icon: '🔑' },
  ];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Hệ thống quản trị</h2>
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest mt-1">Lucky Hub Control Center</p>
        </div>
        <button 
          onClick={() => setShowConsole(!showConsole)} 
          className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${showConsole ? 'bg-slate-800 text-emerald-400 border-none' : 'bg-white text-slate-400 border border-slate-100'}`}
        >
          {showConsole ? '⚡ Tắt Terminal' : '💾 Bật Terminal'}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar bg-white p-2 rounded-[2rem] border border-slate-100 shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'users' && <UserManagement users={users} onRefresh={onRefresh} />}
        {activeTab === 'metrics' && <MetricAdmin users={users} onRefresh={onRefresh} />}
        {activeTab === 'ai' && <AITraining knowledge={knowledge} rules={rules} onRefresh={onRefresh} />}
        {activeTab === 'audit' && <AuditLogs logs={auditLogs} />}
        {activeTab === 'config' && <GeminiConfig />}
      </div>
    </div>
  );
};

export default AdminPanel;