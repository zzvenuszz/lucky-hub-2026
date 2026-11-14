import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { User } from '../../types.ts';
import BadgeDisplay from './BadgeDisplay.tsx';
import NotificationBell from '../notification/NotificationBell.tsx';
import ChatToggle from '../chat/components/ChatToggle.tsx';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isChatOpen?: boolean;
  onChatToggle?: () => void;
}

const getRoleInfo = (groupName?: string): { icon: string; label: string; color: string } => {
  switch (groupName) {
    case 'Quản trị viên':
      return { icon: '🔑', label: 'Quản trị viên', color: 'text-rose-500' };
    case 'Huấn luyện viên':
      return { icon: '🧠', label: 'Huấn luyện viên', color: 'text-amber-500' };
    default:
      return { icon: '🌱', label: groupName || 'Hội viên', color: 'text-emerald-600' };
  }
};

const tabMeta: Record<string, { label: string; icon: string; group: string }> = {
  dashboard: { label: 'Tổng quan', icon: '🏠', group: 'Chính' },
  community: { label: 'Cộng đồng', icon: '📰', group: 'Chính' },
  metrics: { label: 'Chỉ số', icon: '📈', group: 'Chính' },
  profile: { label: 'Hồ sơ', icon: '👤', group: 'Cá nhân' },
  ndd: { label: 'Nhánh & Quản lý NDD', icon: '🌐', group: 'Vận hành' },
  'ndd-admin': { label: 'Nhánh & Quản lý NDD', icon: '🌐', group: 'Vận hành' },
  systemndd: { label: 'Nhánh & Quản lý NDD', icon: '🌐', group: 'Vận hành' },
  admin: { label: 'Admin', icon: '🛡️', group: 'Quản trị' },
};

const Layout: React.FC<LayoutProps> = memo(({ user, onLogout, children, activeTab, setActiveTab, isChatOpen, onChatToggle }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);

  const permissions = (user as any).permissions || [];
  const avatarUrl = useMemo(() => {
    if (user.avatar) return user.avatar;
    return user.gender === 'Nữ'
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;
  }, [user.avatar, user.gender]);

  useEffect(() => {
    const syncSidebarState = () => {
      setDesktopSidebarOpen(window.innerWidth >= 1024);
    };
    syncSidebarState();
    window.addEventListener('resize', syncSidebarState);
    return () => window.removeEventListener('resize', syncSidebarState);
  }, []);

  const roleInfo = useMemo(() => getRoleInfo((user as any).groupName), [(user as any).groupName]);

  const primaryNavItems = useMemo(() => {
    const items = [
      { id: 'dashboard', label: 'Tổng quan', icon: '🏠', activeIcon: '🏠' },
      { id: 'community', label: 'Cộng đồng', icon: '📰', activeIcon: '📰' },
      { id: 'metrics', label: 'Chỉ số', icon: '📊', activeIcon: '📈' },
    ];

    if (permissions.includes('coach:access') || permissions.includes('ndd:manage') || permissions.includes('ndd:admin') || permissions.includes('ndd:system') || permissions.includes('ndd:branch:admin') || permissions.includes('ndd:branch:tab')) {
      items.push({ id: 'ndd', label: 'Nhánh & NDD', icon: '🌐', activeIcon: '🌐' });
    }

    return items;
  }, [permissions]);

  const utilityItems = useMemo(() => {
    const items = [
      { id: 'profile', label: 'Hồ sơ', icon: '👤' },
    ];

    if (permissions.includes('admin:panel')) {
      items.push({ id: 'admin', label: 'Quản trị', icon: '🛡️' });
    }

    return items;
  }, [permissions]);

  const mobileBottomItems = useMemo(() => {
    return [
      { id: 'dashboard', label: 'Trang chủ', icon: '🏠' },
      { id: 'community', label: 'Cộng đồng', icon: '📰' },
      { id: 'metrics', label: 'Số liệu', icon: '📈' },
      { id: 'chat', label: 'Tin nhắn', icon: '💬', action: 'chat' },
      { id: 'more', label: 'Khác', icon: '⋯', action: 'more' },
    ];
  }, []);

  const currentSection = tabMeta[activeTab] || { label: 'Lucky Hub', icon: '✨', group: 'Chính' };

  const handleNavClick = useCallback((tab: string) => {
    setActiveTab(tab);
    setIsMenuOpen(false);
    setMobileNavOpen(false);
  }, [setActiveTab]);

  const handleMobilePrimaryAction = useCallback((item: { id: string; action?: string }) => {
    if (item.action === 'chat') {
      onChatToggle?.();
      return;
    }

    if (item.action === 'more') {
      setMobileNavOpen(true);
      return;
    }

    handleNavClick(item.id);
  }, [handleNavClick, onChatToggle]);

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[280px] shrink-0 border-r border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-transform duration-300 lg:translate-x-0 lg:static ${desktopSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${desktopSidebarOpen ? 'lg:flex' : 'lg:hidden'}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
              <button onClick={() => handleNavClick('dashboard')} className="flex items-center gap-3 text-left">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-200">
                  <img src="/favicon/luckyhub.png" alt="Lucky Hub" className="h-7 w-7 object-contain" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Wellness</div>
                  <div className="text-lg font-black text-slate-800">Lucky Hub</div>
                </div>
              </button>
              <button
                onClick={() => setDesktopSidebarOpen(false)}
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200 lg:flex"
                aria-label="Đóng sidebar"
              >
                ‹
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="mb-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-3 ring-1 ring-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="overflow-hidden rounded-full border-2 border-white shadow-md shadow-emerald-100">
                    <img src={avatarUrl} alt={user.fullName} className="h-12 w-12 object-cover" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">{user.fullName}</p>
                    <p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] ${roleInfo.color}`}>
                      <span>{roleInfo.icon}</span>
                      <span>{roleInfo.label}</span>
                    </p>
                  </div>
                </div>
              </div>

              <nav className="space-y-6">
                <div>
                  <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Chính</p>
                  <div className="space-y-1.5">
                    {primaryNavItems.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                            isActive
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          <span className="text-xl">{isActive ? item.activeIcon : item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Cá nhân</p>
                  <div className="space-y-1.5">
                    {utilityItems.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                            isActive
                              ? 'bg-slate-900 text-white shadow-lg shadow-slate-300'
                              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                          }`}
                        >
                          <span className="text-xl">{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </nav>
            </div>

            <div className="border-t border-slate-200/80 p-4">
              {user.badges && user.badges.length > 0 && (
                <div className="mb-4 rounded-2xl bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Thành tựu</p>
                    <span className="text-xs font-bold text-slate-500">{user.badges.length}</span>
                  </div>
                  <BadgeDisplay badgeIds={user.badges} />
                </div>
              )}

              <button
                onClick={onLogout}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-rose-600 transition hover:bg-rose-100"
              >
                <span>🔒</span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </aside>

        {desktopSidebarOpen && (
          <button
            aria-label="Overlay sidebar"
            onClick={() => setDesktopSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          />
        )}

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
            <div className="flex h-20 items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-600 transition hover:bg-slate-200 lg:hidden"
                  aria-label="Mở menu"
                >
                  ☰
                </button>

                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{currentSection.group}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currentSection.icon}</span>
                    <h2 className="truncate text-base font-black text-slate-800 sm:text-lg">{currentSection.label}</h2>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button className="hidden h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-lg text-slate-600 transition hover:bg-slate-200 md:flex" aria-label="Tìm kiếm">
                  🔎
                </button>
                <NotificationBell currentUser={user} />
                <ChatToggle isChatOpen={!!isChatOpen} onToggle={() => onChatToggle?.()} />
                <div className="relative" ref={undefined}>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border-2 border-white shadow-md shadow-slate-200 transition hover:border-emerald-200"
                    aria-label="Tài khoản"
                  >
                    <img src={avatarUrl} alt={user.fullName} className="h-full w-full object-cover" />
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 z-50 mt-3 w-72 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_60px_rgba(15,23,42,0.15)]">
                      <div className="border-b border-slate-100 px-4 py-4">
                        <p className="text-base font-black text-slate-800">{user.fullName}</p>
                        <p className={`mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] ${roleInfo.color}`}>
                          <span>{roleInfo.icon}</span>
                          <span>{roleInfo.label}</span>
                        </p>
                      </div>

                      <div className="p-2">
                        {utilityItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <span className="text-lg">{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        ))}

                        {user.badges && user.badges.length > 0 && (
                          <div className="mt-2 rounded-2xl bg-slate-50 p-3">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Thành tựu</p>
                            <BadgeDisplay badgeIds={user.badges} />
                          </div>
                        )}

                        <button
                          onClick={onLogout}
                          className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black uppercase tracking-[0.12em] text-rose-600 transition hover:bg-rose-50"
                        >
                          <span>🔒</span>
                          <span>Thoát tài khoản</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-14px_35px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
        <nav className="mx-auto flex max-w-md items-center justify-between gap-1 rounded-[26px] bg-slate-100/80 p-1.5">
          {mobileBottomItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMobilePrimaryAction(item)}
              className={`flex flex-col items-center justify-center rounded-[22px] px-2 py-2 text-[10px] font-bold transition ${
                item.id === activeTab ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 lg:hidden">
          <div className="w-full rounded-t-[30px] bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-20px_40px_rgba(15,23,42,0.15)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Khác</p>
                <h3 className="text-lg font-black text-slate-800">Tiện ích</h3>
              </div>
              <button onClick={() => setMobileNavOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600">✕</button>
            </div>

            <div className="space-y-2">
              {utilityItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left text-sm font-bold text-slate-700"
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}

              {permissions.includes('admin:panel') && (
                <button
                  onClick={() => handleNavClick('admin')}
                  className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-black uppercase tracking-[0.12em] text-amber-700"
                >
                  <span className="text-lg">🛡️</span>
                  <span>Admin Panel</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

Layout.displayName = 'Layout';

export default Layout;
