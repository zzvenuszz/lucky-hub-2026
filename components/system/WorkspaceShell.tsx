import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../../types.ts';
import NotificationBell from '../notification/NotificationBell.tsx';
import BrandFooter from './BrandFooter.tsx';
import { SystemBranding } from '../../utils/systemBranding.ts';

interface WorkspaceShellProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isChatOpen?: boolean;
  onChatToggle?: (open?: boolean) => void;
  isSystemLogOpen?: boolean;
  onSystemLogToggle?: () => void;
  branding: SystemBranding;
}

type IconName = 'overview' | 'community' | 'health' | 'coach' | 'branch' | 'admin' | 'chat' | 'more' | 'profile' | 'logout' | 'menu' | 'close' | 'chevron' | 'inventory' | 'report';

const ICONS: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  community: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  health: <><path d="M20.8 8.6c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11a4.7 4.7 0 0 1 8.8-2.2 4.7 4.7 0 0 1 8.8 2.2Z" /><path d="M4 12h4l2-4 3.2 8 2-4H20" /></>,
  coach: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  branch: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 9v3a6 6 0 0 0 6 6h3" /><path d="M15 6h3" /><circle cx="18" cy="6" r="3" /></>,
  admin: <><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z" /><path d="M9 12h6M12 9v6" /></>,
  inventory: <><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>,
  report: <><path d="M3 3v18h18" /><path d="M7 16v-5M12 16V8M17 16v-8" /></>,
  chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
};

const Icon: React.FC<{ name: IconName; size?: number }> = ({ name, size = 20 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </svg>
);

const WorkspaceShell: React.FC<WorkspaceShellProps> = memo(({ user, onLogout, children, activeTab, setActiveTab, isChatOpen, onChatToggle, isSystemLogOpen, onSystemLogToggle, branding }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const permissions = (user as any).permissions || [];
  const isAdmin = permissions.includes('admin:panel');
  const canManageNdd = permissions.includes('coach:access') || permissions.includes('ndd:manage');
  const canManageBranches = permissions.includes('ndd:system');
  const canManageInventory = permissions.includes('inventory:manage');
  const canSellInventory = permissions.includes('inventory:sell');
  const canManagePriceList = permissions.includes('pricelist:manage');
  const canManageMemberLevels = permissions.includes('members:level:manage') || permissions.includes('members:level:manage:any');

  const navGroups = useMemo(() => [
    {
      label: 'Không gian của bạn',
      items: [
        { id: 'dashboard', label: 'Tổng quan', icon: 'overview' as IconName },
        { id: 'community', label: 'Cộng đồng', icon: 'community' as IconName },
        { id: 'metrics', label: 'Sức khỏe', icon: 'health' as IconName },
      ],
    },
    ...(canManageNdd || canManageBranches ? [{
      label: 'Vận hành',
      items: [
        ...(canManageNdd ? [{ id: 'ndd', label: 'Quản lý NDD', icon: 'coach' as IconName }] : []),
        ...(canManageBranches ? [{ id: 'systemndd', label: 'Chi nhánh NDD', icon: 'branch' as IconName }] : []),
      ],
    }] : []),
    ...(canManageInventory || canSellInventory || canManagePriceList || canManageMemberLevels ? [{ label: 'Bán hàng', items: [
      ...(canManageInventory ? [{ id: 'inventory', label: 'Quản lý hàng hoá', icon: 'inventory' as IconName }] : []),
      ...(!canManageInventory && canSellInventory ? [{ id: 'inventory', label: 'Bán hàng', icon: 'inventory' as IconName }] : []),
      ...(canManageInventory || canSellInventory ? [{ id: 'inventory-reports', label: 'Báo cáo bán hàng', icon: 'report' as IconName }] : []),
      ...(canManagePriceList ? [{ id: 'inventory-prices', label: 'Bảng giá chung', icon: 'inventory' as IconName }] : []),
      ...(canManageMemberLevels && !canManageInventory ? [{ id: 'member-levels', label: permissions.includes('members:level:manage:any') ? 'Quản lý cấp độ hội viên' : 'Cấp độ tuyến dưới', icon: 'inventory' as IconName }] : []),
    ] }] : []),
    ...(isAdmin ? [{ label: 'Hệ thống', items: [{ id: 'admin', label: 'Quản trị', icon: 'admin' as IconName }] }] : []),
  ], [canManageBranches, canManageNdd, canManageInventory, canSellInventory, canManagePriceList, canManageMemberLevels, isAdmin]);

  const pageTitle = useMemo(() => {
    const item = navGroups.flatMap(group => group.items).find(navItem => navItem.id === activeTab);
    if (item) return item.label;
    if (activeTab === 'profile') return 'Hồ sơ cá nhân';
    if (activeTab === 'inventory-reports') return 'Báo cáo bán hàng';
    if (activeTab === 'inventory-prices') return 'Bảng giá chung';
    if (activeTab === 'member-levels') return 'Cấp độ tuyến dưới';
    return 'Lucky Hub';
  }, [activeTab, navGroups]);

  const navigate = useCallback((tab: string) => {
    onChatToggle?.(false);
    setActiveTab(tab);
    setIsDrawerOpen(false);
    setIsMoreOpen(false);
    setIsAccountOpen(false);
    console.log(`[WorkspaceShell] Navigation: ${tab}`);
    window.debugLog?.(`[WorkspaceShell] Điều hướng đến ${tab}`, 'navigation');
  }, [setActiveTab, onChatToggle]);

  const handleShellClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isChatOpen) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-chat-panel="true"]') || target.closest('[data-chat-toggle="true"]')) return;
    onChatToggle?.(false);
  }, [isChatOpen, onChatToggle]);

  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDrawerOpen(false);
        setIsMoreOpen(false);
        setIsAccountOpen(false);
      }
    };
    window.addEventListener('keydown', closeMenus);
    return () => window.removeEventListener('keydown', closeMenus);
  }, []);

  useEffect(() => {
    if (!isAccountOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setIsAccountOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isAccountOpen]);

  const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.fullName || 'Lucky Hub')}&backgroundColor=194f3b&textColor=ffffff`;
  const moreItems = [
    { id: 'profile', label: 'Hồ sơ cá nhân', icon: 'profile' as IconName },
    ...(canManageInventory ? [{ id: 'inventory', label: 'Quản lý bán hàng', icon: 'inventory' as IconName }] : []),
    ...(!canManageInventory && canSellInventory ? [{ id: 'inventory', label: 'Bán hàng', icon: 'inventory' as IconName }] : []),
    ...(canManageInventory || canSellInventory ? [{ id: 'inventory-reports', label: 'Báo cáo bán hàng', icon: 'report' as IconName }] : []),
    ...(canManagePriceList ? [{ id: 'inventory-prices', label: 'Quản lý bảng giá', icon: 'inventory' as IconName }] : []),
    ...(canManageMemberLevels && !canManageInventory ? [{ id: 'member-levels', label: permissions.includes('members:level:manage:any') ? 'Quản lý cấp độ hội viên' : 'Cấp độ tuyến dưới', icon: 'inventory' as IconName }] : []),
    ...(canManageNdd ? [{ id: 'ndd', label: 'Quản lý NDD', icon: 'coach' as IconName }] : []),
    ...(canManageBranches ? [{ id: 'systemndd', label: 'Chi nhánh NDD', icon: 'branch' as IconName }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Quản trị', icon: 'admin' as IconName }] : []),
  ];

  console.log(`[WorkspaceShell] Render: user=${user.fullName}, activeTab=${activeTab}`);

  return (
    <div className="lh-workspace" onClickCapture={handleShellClickCapture}>
      <style>{`
        .lh-workspace{--lh-ink:#172722;--lh-muted:#718079;--lh-line:#e5eae5;--lh-canvas:#f4f6f2;--lh-paper:#fff;--lh-green:#226b4b;--lh-green-dark:#194f3b;--lh-lime:#d5ef91;--lh-coral:#df795b;min-height:100vh;background:var(--lh-canvas);color:var(--lh-ink);font-family:'DM Sans','Manrope',sans-serif}
        .lh-workspace *{box-sizing:border-box}
        .lh-side{position:fixed;inset:0 auto 0 0;z-index:70;width:250px;padding:24px 16px 18px;background:var(--lh-paper);border-right:1px solid var(--lh-line);display:flex;flex-direction:column;transition:transform .24s ease}
        .lh-brand{display:flex;align-items:center;gap:11px;padding:0 10px 26px;color:var(--lh-ink);text-align:left;text-decoration:none}
        .lh-brand-mark{width:38px;height:38px;display:grid;place-items:center}
        .lh-brand-name{font-family:'Manrope',sans-serif;font-size:19px;font-weight:800;line-height:1;text-transform:uppercase}
        .lh-brand-tag{display:block;margin-top:5px;color:var(--lh-muted);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .lh-nav-scroll{flex:1;overflow:auto}
        .lh-nav-group{margin-bottom:22px}
        .lh-nav-label{padding:0 11px 8px;color:#929d96;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .lh-nav-item{width:100%;min-height:44px;display:flex;align-items:center;gap:12px;padding:0 11px;border:0;border-radius:10px;background:transparent;color:#64716a;text-align:left;font:600 13px inherit;cursor:pointer;transition:background .16s,color .16s}
        .lh-nav-item:hover{background:#f2f5ef;color:var(--lh-green-dark)}
        .lh-nav-item.is-active{background:#eaf3e8;color:var(--lh-green-dark);font-weight:800}
        .lh-nav-item.is-active .lh-nav-icon{color:var(--lh-green)}
        .lh-nav-icon{width:21px;height:21px;display:grid;place-items:center;color:#88958d}
        .lh-side-bottom{padding-top:14px;border-top:1px solid var(--lh-line)}
        .lh-member-card{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:#f6f8f5}
        .lh-member-card img,.lh-avatar{width:36px;height:36px;flex:none;border-radius:50%;object-fit:cover;background:#dce7db}
        .lh-member-name{overflow:hidden;color:var(--lh-ink);font-size:12px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .lh-member-role{margin-top:3px;color:var(--lh-muted);font-size:10px}
        .lh-main{min-height:100vh;margin-left:250px;display:flex;flex-direction:column}
        .lh-topbar{height:72px;position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:0 32px;background:#f4f6f2ed;border-bottom:1px solid #e5eae5cc;backdrop-filter:blur(16px)}
        .lh-topbar-left,.lh-topbar-actions{display:flex;align-items:center;gap:14px}
        .lh-page-title{margin:0;font-family:'Manrope',sans-serif;font-size:20px;font-weight:800;letter-spacing:0;text-transform:uppercase}
        .lh-context{margin-top:3px;color:var(--lh-muted);font-size:11px}
        .lh-icon-button{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--lh-line);border-radius:12px;background:var(--lh-paper);color:#46564c;cursor:pointer;transition:background .16s,border-color .16s}
        .lh-icon-button:hover{background:#edf3eb;border-color:#cddccc}
        .lh-menu-trigger{display:none}
        .lh-account{position:relative}
        .lh-account-trigger{display:flex;align-items:center;gap:9px;padding:3px 5px 3px 3px;border:1px solid transparent;border-radius:13px;background:transparent;text-align:left;cursor:pointer}
        .lh-account-trigger:hover,.lh-account-trigger[aria-expanded="true"]{border-color:var(--lh-line);background:white}
        .lh-account-trigger img{width:36px;height:36px;border-radius:50%;object-fit:cover}
        .lh-account-copy{max-width:150px;display:flex;flex-direction:column;align-items:flex-start}
        .lh-account-name{overflow:hidden;font-size:12px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .lh-account-role{margin-top:2px;color:var(--lh-muted);font-size:10px}
        .lh-account-menu{position:absolute;right:0;top:calc(100% + 10px);width:220px;padding:8px;border:1px solid var(--lh-line);border-radius:14px;background:white;box-shadow:0 18px 42px #1c342318}
        .lh-account-menu button{width:100%;display:flex;align-items:center;gap:10px;padding:11px;border:0;border-radius:9px;background:transparent;color:var(--lh-ink);font:600 12px inherit;text-align:left;cursor:pointer}
        .lh-account-menu button:hover{background:#f2f5ef}
        .lh-account-menu .lh-logout{margin-top:5px;border-top:1px solid var(--lh-line);border-radius:0 0 9px 9px;color:#b7503d}
        .lh-content{width:min(100%,1440px);margin:0 auto;padding:28px 32px 56px;flex:1}
        .lh-footer{padding:0 32px 22px;text-align:center;color:var(--lh-muted);font-size:11px;line-height:1.5}
        .lh-footer p{margin:0}
        .lh-mobile-nav,.lh-mobile-more,.lh-drawer-backdrop{display:none}
        @media(max-width:1199px){.lh-side{transform:translateX(-102%);box-shadow:18px 0 42px #1022181a}.lh-side.is-open{transform:translateX(0)}.lh-main{margin-left:0}.lh-menu-trigger{display:grid}.lh-topbar{padding:0 24px}.lh-content{padding-inline:24px}.lh-drawer-backdrop{position:fixed;inset:0;z-index:65;display:block;background:#15231db3;backdrop-filter:blur(2px)}}
        @media(max-width:767px){.lh-side{display:none}.lh-menu-trigger{display:none}.lh-drawer-backdrop[aria-label="Đóng menu điều hướng"]{display:none}.lh-topbar{height:60px;padding:0 15px}.lh-page-title{font-size:18px}.lh-context,.lh-account-copy,.lh-account-trigger>svg{display:none}.lh-account-trigger{padding:0;border:0}.lh-account-trigger img{width:34px;height:34px}.lh-topbar-actions{gap:8px}.lh-icon-button{width:36px;height:36px;border-radius:11px}.lh-content{padding:18px 15px 28px}.lh-footer{padding:0 15px calc(82px + env(safe-area-inset-bottom,0px))}.lh-mobile-nav{position:fixed;inset:auto 0 0;z-index:60;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--lh-line);background:#fffF;box-shadow:0 -8px 28px #1727220d;backdrop-filter:blur(18px)}.lh-mobile-nav button{min-width:0;min-height:46px;display:flex;align-items:center;justify-content:center;border:0;border-radius:11px;background:transparent;color:#849088;cursor:pointer}.lh-mobile-nav button.is-active{color:var(--lh-green-dark)}.lh-mobile-nav button.is-active .lh-mobile-icon{background:#eaf3e8;color:var(--lh-green-dark)}.lh-mobile-icon{width:38px;height:34px;display:grid;place-items:center;border-radius:11px}.lh-mobile-more{position:fixed;inset:auto 10px calc(70px + env(safe-area-inset-bottom,0px));z-index:80;display:block;padding:13px;border:1px solid var(--lh-line);border-radius:16px;background:white;box-shadow:0 16px 44px #17272221}.lh-mobile-more-heading{padding:3px 8px 10px;color:var(--lh-muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.lh-mobile-more button{width:100%;min-height:45px;display:flex;align-items:center;gap:11px;padding:0 9px;border:0;border-radius:9px;background:transparent;color:var(--lh-ink);font:700 12px inherit;text-align:left}.lh-mobile-more button:hover{background:#f2f5ef}.lh-member-card{display:none}.lh-account-menu{position:fixed;top:58px;right:10px}}
        @media(prefers-reduced-motion:reduce){.lh-workspace *{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}}
      `}</style>

      {isDrawerOpen && <button className="lh-drawer-backdrop" aria-label="Đóng menu điều hướng" onClick={() => setIsDrawerOpen(false)} />}
      <aside className={`lh-side${isDrawerOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
        <button className="lh-brand" onClick={() => navigate('dashboard')}>
          <span className="lh-brand-mark"><img src={branding.logoUrl || '/favicon/luckyhub.png'} alt="" width="25" height="25" /></span>
          <span><span className="lh-brand-name">Lucky Hub</span><span className="lh-brand-tag">{branding.slogan}</span></span>
        </button>
        <nav className="lh-nav-scroll">
          {navGroups.map(group => (
            <div className="lh-nav-group" key={group.label}>
              <div className="lh-nav-label">{group.label}</div>
              {group.items.map(item => (
                <button key={item.id} className={`lh-nav-item${activeTab === item.id ? ' is-active' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
                  <span className="lh-nav-icon"><Icon name={item.icon} size={19} /></span>{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="lh-side-bottom">
          <div className="lh-member-card"><div className="lh-member-name">Lucky Hub v1.0.1</div></div>
        </div>
      </aside>

      <div className="lh-main">
        <header className="lh-topbar">
          <div className="lh-topbar-left">
            <button className="lh-icon-button lh-menu-trigger" aria-label="Mở menu điều hướng" aria-expanded={isDrawerOpen} onClick={() => setIsDrawerOpen(true)}><Icon name="menu" /></button>
            <div>{activeTab === 'admin' ? <><h1 className="lh-page-title">🛡️ Quản trị hệ thống</h1><div className="lh-context">Admin Center</div></> : <h1 className="lh-page-title">{pageTitle}</h1>}</div>
          </div>
          <div className="lh-topbar-actions">
            <div className="lh-topbar-notifications"><NotificationBell currentUser={user} /></div>
            <button data-chat-toggle="true" className={`lh-icon-button lh-desktop-chat${isChatOpen ? ' is-active' : ''}`} aria-label={isChatOpen ? 'Đóng tin nhắn' : 'Mở tin nhắn'} title="Tin nhắn" onClick={() => onChatToggle?.()}><Icon name="chat" size={19} /></button>
            <div className="lh-account" ref={accountRef} onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsAccountOpen(false);
            }}>
              <button className="lh-account-trigger" aria-label="Menu tài khoản" aria-expanded={isAccountOpen} onClick={() => setIsAccountOpen(open => !open)}>
                <img src={avatarUrl} alt="" /><span className="lh-account-copy"><span className="lh-account-name">{user.fullName}</span><span className="lh-account-role">{(user as any).groupName || 'Thành viên'}</span></span><Icon name="chevron" size={15} />
              </button>
              {isAccountOpen && <div className="lh-account-menu" role="menu">
                <button role="menuitem" onClick={() => navigate('profile')}><Icon name="profile" size={17} />Hồ sơ cá nhân</button>
                {isAdmin && <button role="menuitem" onClick={() => { onSystemLogToggle?.(); setIsAccountOpen(false); }}><span aria-hidden="true">{isSystemLogOpen ? '❌' : '📟'}</span>{isSystemLogOpen ? 'Đóng System Log' : 'Mở System Log'}</button>}
                <button role="menuitem" className="lh-logout" onClick={onLogout}><Icon name="logout" size={17} />Đăng xuất</button>
              </div>}
            </div>
          </div>
        </header>
        <main className="lh-content"><div key={activeTab} className="lh-page-enter">{children}</div></main>
        <BrandFooter branding={branding} className="lh-footer" />
      </div>

      {isMoreOpen && <><button className="lh-drawer-backdrop" aria-label="Đóng menu khác" onClick={() => setIsMoreOpen(false)} /><div className="lh-mobile-more" role="menu"><div className="lh-mobile-more-heading">Không gian & tài khoản</div>{moreItems.map(item => <button key={item.id} role="menuitem" onClick={() => navigate(item.id)}><Icon name={item.icon} size={18} />{item.label}</button>)}<button role="menuitem" onClick={onLogout}><Icon name="logout" size={18} />Đăng xuất</button></div></>}

      <nav className="lh-mobile-nav" aria-label="Điều hướng nhanh">
        <button className={activeTab === 'dashboard' ? 'is-active' : ''} aria-current={activeTab === 'dashboard' ? 'page' : undefined} aria-label="Tổng quan" title="Tổng quan" onClick={() => navigate('dashboard')}><span className="lh-mobile-icon"><Icon name="overview" size={20} /></span></button>
        <button className={activeTab === 'community' ? 'is-active' : ''} aria-current={activeTab === 'community' ? 'page' : undefined} aria-label="Cộng đồng" title="Cộng đồng" onClick={() => navigate('community')}><span className="lh-mobile-icon"><Icon name="community" size={20} /></span></button>
        <button className={activeTab === 'metrics' ? 'is-active' : ''} aria-current={activeTab === 'metrics' ? 'page' : undefined} aria-label="Sức khỏe" title="Sức khỏe" onClick={() => navigate('metrics')}><span className="lh-mobile-icon"><Icon name="health" size={20} /></span></button>
        <button className={isMoreOpen ? 'is-active' : ''} aria-expanded={isMoreOpen} aria-label="Khác" title="Khác" onClick={() => setIsMoreOpen(open => !open)}><span className="lh-mobile-icon"><Icon name="more" size={20} /></span></button>
      </nav>
    </div>
  );
});

WorkspaceShell.displayName = 'WorkspaceShell';

export default WorkspaceShell;
