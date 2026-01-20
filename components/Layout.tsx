
import React from 'react';
import { User, UserRole } from '../types';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, activeTab, setActiveTab }) => {
  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=059669&color=fff&bold=true`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={() => setActiveTab('dashboard')}>
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-emerald-100 group-hover:scale-105 transition-transform">L</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Lucky Hub</h1>
          </div>
          
          <nav className="hidden md:flex items-center space-x-1 bg-slate-50 p-1 rounded-2xl">
            {[
              { id: 'dashboard', label: 'Bảng điều khiển' },
              { id: 'chat', label: 'Trò chuyện' },
              { id: 'profile', label: 'Cá nhân' }
            ].map(tab => (
              <button 
                key={tab.id} onClick={() => setActiveTab(tab.id)} 
                className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${activeTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {tab.label}
              </button>
            ))}
            {user.role === UserRole.ADMIN && (
              <button 
                onClick={() => setActiveTab('admin')} 
                className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all ${activeTab === 'admin' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Quản trị
              </button>
            )}
          </nav>

          <div className="flex items-center space-x-4">
            <div className="hidden lg:block text-right">
              <div className="text-sm font-bold text-slate-800">{user.fullName}</div>
              <div className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">{user.role}</div>
            </div>
            <div className="w-10 h-10 rounded-xl border border-slate-100 shadow-sm overflow-hidden bg-slate-50 cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all" onClick={() => setActiveTab('profile')}>
              <img 
                src={user.avatar || defaultAvatar} 
                alt={user.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <button onClick={onLogout} className="p-2.5 hover:bg-red-50 text-red-400 rounded-xl transition-all hover:scale-110 active:scale-90" title="Đăng xuất">🚪</button>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-100 py-10 mt-10">
        <div className="container mx-auto px-4 text-center space-y-3">
          <div className="flex justify-center items-center space-x-4">
            <span className="w-10 h-[1px] bg-slate-100"></span>
            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-300 font-bold text-xs">L</div>
            <span className="w-10 h-[1px] bg-slate-100"></span>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Copyright 2025 by Huy Hoàn</p>
          <p className="text-slate-300 text-[10px] font-medium italic">Lucky Hub Health Management Platform v2.0</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
