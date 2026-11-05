import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

export interface SubTabItem {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: SubTabItem[];
  activeTab: string;
  onSelect: (tab: any) => void;
}

const ScrollableSubTabs: React.FC<Props> = memo(({ tabs, activeTab, onSelect }) => {
  const navRef = useRef<HTMLElement | null>(null);
  const initialRenderRef = useRef(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const nextLeft = scrollLeft > 4;
    const nextRight = scrollLeft + clientWidth < scrollWidth - 4;
    setCanScrollLeft(prev => (prev !== nextLeft ? nextLeft : prev));
    setCanScrollRight(prev => (prev !== nextRight ? nextRight : prev));
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    const el = navRef.current;
    if (!el) return;

    const handleResize = () => updateScrollIndicators();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateScrollIndicators());
      observer.observe(el);
    }

    const timer = window.setTimeout(updateScrollIndicators, 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [tabs, updateScrollIndicators]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    // Tránh gọi scrollIntoView khi mới tải trang với tab đầu tiên để không gây lỗi cắt layer trên WebKit/iOS
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      if (activeTab === tabs[0]?.id) {
        updateScrollIndicators();
        return;
      }
    }

    const activeBtn = el.querySelector<HTMLButtonElement>(`[data-subtab-id="${activeTab}"]`);
    if (activeBtn) {
      const btnLeft = activeBtn.offsetLeft;
      const btnRight = btnLeft + activeBtn.offsetWidth;
      const viewLeft = el.scrollLeft;
      const viewRight = viewLeft + el.clientWidth;

      if (btnLeft < viewLeft + 16) {
        el.scrollTo({ left: Math.max(0, btnLeft - 16), behavior: 'smooth' });
      } else if (btnRight > viewRight - 16) {
        el.scrollTo({ left: btnRight - el.clientWidth + 16, behavior: 'smooth' });
      }
    }

    const timer = window.setTimeout(updateScrollIndicators, 240);
    return () => window.clearTimeout(timer);
  }, [activeTab, tabs, updateScrollIndicators]);

  const handleScrollBy = useCallback((direction: 'left' | 'right') => {
    const el = navRef.current;
    if (!el) return;
    const delta = direction === 'left' ? -220 : 220;
    console.log('[ScrollableSubTabs] Scroll button clicked:', { direction, delta });
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  const handleTabClick = useCallback(
    (tabId: string) => {
      console.log('[ScrollableSubTabs] Tab selected:', { tabId });
      onSelect(tabId);
    },
    [onSelect]
  );

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Kéo danh sách tab sang trái"
          data-testid="subtabs-scroll-left"
          onClick={() => handleScrollBy('left')}
          className="absolute inset-y-0 left-0 z-20 flex h-full w-3 items-center justify-center rounded-l-2xl border-r border-orange-300/80 bg-gradient-to-b from-amber-500 via-orange-500 to-orange-600 text-white shadow-sm transition hover:brightness-110 active:brightness-95"
        >
          <svg
            className="h-3/4 w-2.5"
            viewBox="0 0 10 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M7.5 4 L2.5 24 L7.5 44" />
            <path d="M9 11 L4.5 24 L9 37" opacity="0.55" />
          </svg>
        </button>
      )}

      <nav
        ref={navRef}
        onScroll={updateScrollIndicators}
        className="flex items-center gap-2 overflow-x-auto overflow-y-hidden no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        aria-label="Quản lý bán hàng"
      >
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            data-subtab-id={item.id}
            onClick={() => handleTabClick(item.id)}
            className={`flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition-colors ${
              activeTab === item.id
                ? 'bg-emerald-700 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="leading-none" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {canScrollRight && (
        <button
          type="button"
          aria-label="Kéo danh sách tab sang phải"
          data-testid="subtabs-scroll-right"
          onClick={() => handleScrollBy('right')}
          className="absolute inset-y-0 right-0 z-20 flex h-full w-3 items-center justify-center rounded-r-2xl border-l border-orange-300/80 bg-gradient-to-b from-amber-500 via-orange-500 to-orange-600 text-white shadow-sm transition hover:brightness-110 active:brightness-95"
        >
          <svg
            className="h-3/4 w-2.5"
            viewBox="0 0 10 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M2.5 4 L7.5 24 L2.5 44" />
            <path d="M1 11 L5.5 24 L1 37" opacity="0.55" />
          </svg>
        </button>
      )}
    </div>
  );
});

ScrollableSubTabs.displayName = 'ScrollableSubTabs';

export default ScrollableSubTabs;
