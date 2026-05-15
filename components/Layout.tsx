
import React, { useState, useRef, useEffect } from 'react';
import { User, UserRole } from '../types.ts';
import BadgeDisplay from './BadgeDisplay.tsx';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, activeTab, setActiveTab }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const getAvatar = () => {
    if (user.avatar) return user.avatar;
    return user.gender === 'Nữ'
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = (tab: string) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group shrink-0" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 group-hover:scale-110 group-hover:rotate-12 transition-all p-2">
              <img src="/favicon/luckyhub.png" alt="Lucky Hub" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 hidden sm:block">Lucky Hub</h1>
          </div>
          
          <nav className="flex-1 mx-2 sm:mx-8 flex items-center space-x-1 bg-slate-50 p-1 rounded-2xl">
            {[
              { id: 'dashboard', label: '📊 Tổng quan' },
              { id: 'community', label: '🌍 Cộng đồng' },
              { id: 'metrics', label: '📈 Chỉ số' }
            ].map(tab => (
              <button 
                key={tab.id} onClick={() => setActiveTab(tab.id)} 
                className={`flex-1 px-2 sm:px-6 py-2 rounded-xl text-[9px] sm:text-xs font-black uppercase tracking-tight sm:tracking-wide transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
            <div className="hidden lg:flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">{user.fullName}</span>
                <BadgeDisplay badgeIds={user.badges} />
              </div>
              <div className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">{user.role}</div>
            </div>
            
            <div className="relative" ref={menuRef}>
              <div 
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden shadow-sm ${isMenuOpen ? 'border-emerald-500 scale-105 ring-4 ring-emerald-50' : 'border-slate-100 hover:border-emerald-300'}`}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <img src={getAvatar()} alt={user.fullName} className="w-full h-full object-cover" />
              </div>

              {isMenuOpen && (
                <div className="absolute right-0 mt-3 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 py-3 z-[100] animate-in slide-in-from-top-2 duration-200">
                  <div className="px-5 py-3 border-b border-slate-50 mb-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hồ sơ hội viên</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-bold text-slate-800 truncate">{user.fullName}</p>
                      <BadgeDisplay badgeIds={user.badges} />
                    </div>
                  </div>
                  
                  <div className="px-2 space-y-1">
                    <button onClick={() => handleMenuClick('profile')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all text-sm font-bold group">
                      <span className="text-lg group-hover:scale-110 transition-transform">👤</span> Hồ sơ cá nhân
                    </button>
                    <button onClick={() => handleMenuClick('metrics')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all text-sm font-bold group">
                      <span className="text-lg group-hover:scale-110 transition-transform">📊</span> Lịch sử chỉ số
                    </button>
                    {user.role === UserRole.ADMIN && (
                      <button onClick={() => handleMenuClick('admin')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-amber-600 hover:bg-amber-50 transition-all text-sm font-bold group">
                        <span className="text-lg group-hover:scale-110 transition-transform">🛡️</span> Quản trị Lucky Hub
                      </button>
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-50 px-2">
                    <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-rose-500 hover:bg-rose-50 transition-all text-sm font-black uppercase tracking-widest group">
                      <span className="text-lg group-hover:translate-x-1 transition-transform">🚪</span> Thoát tài khoản
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 relative">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>

      <footer className="bg-white border-t border-slate-100 py-10 mt-10">
        <div className="container mx-auto px-4 text-center space-y-3">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">© 2026 Lucky Hub - Chuyên gia sức khỏe của bạn</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
