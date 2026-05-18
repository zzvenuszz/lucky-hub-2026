import React, { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react';
import { User, UserRole } from '../../types.ts';
import BadgeDisplay from './BadgeDisplay.tsx';
import NotificationBell from '../notification/NotificationBell.tsx';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: '📊', text: 'Tổng quan' },
  { id: 'community', label: '🌍', text: 'Cộng đồng' },
  { id: 'metrics', label: '📈', text: 'Chỉ số' },
  { id: 'coach', label: '🎯', text: 'Coach' },
];

const getRoleInfo = (role: UserRole): { icon: string; label: string; color: string } => {
  switch (role) {
    case UserRole.ADMIN:
      return { icon: '🔑', label: 'Quản trị viên', color: 'text-red-600' };
    case UserRole.COACH:
      return { icon: '📋', label: 'Huấn luyện viên', color: 'text-amber-600' };
    default:
      return { icon: '🌱', label: 'Hội viên', color: 'text-emerald-600' };
  }
};

const Layout: React.FC<LayoutProps> = memo(({ user, onLogout, children, activeTab, setActiveTab }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const avatarUrl = useMemo(() => {
    if (user.avatar) return user.avatar;
    return user.gender === 'Nữ'
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;
  }, [user.avatar, user.gender]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMenuClick = useCallback((tab: string) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
  }, [setActiveTab]);

  const roleInfo = useMemo(() => getRoleInfo(user.role), [user.role]);

  const availableNavItems = useMemo(() => {
    const items = NAV_ITEMS.filter(item => {
      if (item.id === 'coach') {
        return user.role === UserRole.COACH || user.role === UserRole.ADMIN;
      }
      return true;
    });
    return items;
  }, [user.role]);

  console.log(`[Layout] Render: user=${user.fullName}, role=${user.role}, activeTab=${activeTab}`);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center gap-1 sm:gap-3">
          {/* Logo + Title */}
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer group shrink-0" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 group-hover:scale-110 group-hover:rotate-12 transition-all p-2">
              <img src="/favicon/luckyhub.png" alt="Lucky Hub" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 hidden sm:block">Lucky Hub</h1>
          </div>
          
          {/* Navigation - Icon lớn + Text, responsive */}
          <nav className="flex-auto max-w-fit flex items-center space-x-0.5 sm:space-x-1 bg-slate-50 p-0.5 sm:p-1 rounded-2xl overflow-x-auto no-scrollbar">
            {availableNavItems.map(tab => (
              <button 
                key={tab.id} onClick={() => setActiveTab(tab.id)} 
                className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-tight sm:tracking-wide transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <span className="text-base sm:text-lg">{tab.label}</span>
                <span className="hidden md:inline ml-1.5">{tab.text}</span>
              </button>
            ))}
          </nav>

          {/* Right section: Notification + Avatar only */}
          <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
            <NotificationBell currentUser={user} />

            <div className="relative" ref={menuRef}>
              <div 
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border-2 transition-all cursor-pointer overflow-hidden shadow-sm ${isMenuOpen ? 'border-emerald-500 scale-105 ring-4 ring-emerald-50' : 'border-slate-100 hover:border-emerald-300'}`}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <img src={avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
              </div>

              {isMenuOpen && (
                <div className="absolute right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl border border-slate-100 py-4 z-[100] animate-in slide-in-from-top-2 duration-200">
                  {/* User info: Tên + Role */}
                  <div className="px-5 pb-3 border-b border-slate-100">
                    <p className="text-base font-black text-slate-800">{user.fullName}</p>
                    <p className={`text-xs font-black uppercase tracking-wider mt-0.5 ${roleInfo.color}`}>
                      {roleInfo.icon} {roleInfo.label}
                    </p>
                  </div>

                  {/* Badges section */}
                  {user.badges && user.badges.length > 0 && (
                    <div className="px-5 py-3 border-b border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">🏆 Thành tựu đạt được</p>
                      <BadgeDisplay badgeIds={user.badges} />
                    </div>
                  )}

                  {/* Menu items */}
                  <div className="px-2 mt-2 space-y-1">
                    <button onClick={() => handleMenuClick('profile')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all text-sm font-bold group">
                      <span className="text-lg group-hover:scale-110 transition-transform">👤</span> Hồ sơ cá nhân
                    </button>
                    <button onClick={() => handleMenuClick('metrics')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-all text-sm font-bold group">
                      <span className="text-lg group-hover:scale-110 transition-transform">📊</span> Lịch sử chỉ số
                    </button>
                    {user.role === UserRole.ADMIN && (
                      <button onClick={() => handleMenuClick('admin')} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-amber-600 hover:bg-amber-50 transition-all text-sm font-bold group">
                        <span className="text-lg group-hover:scale-110 transition-transform">🛡️</span> Admin Panel
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
});

Layout.displayName = 'Layout';

export default Layout;
