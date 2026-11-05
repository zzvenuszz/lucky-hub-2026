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

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [tabs, updateScrollIndicators]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLButtonElement>(`[data-subtab-id="${activeTab}"]`);
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    const timer = window.setTimeout(updateScrollIndicators, 220);
    return () => window.clearTimeout(timer);
  }, [activeTab, updateScrollIndicators]);

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
    <div className="relative rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      {canScrollLeft && (
        <div className="pointer-events-none absolute inset-y-1 left-1 z-10 flex items-center rounded-l-xl bg-gradient-to-r from-white via-white/95 to-transparent pr-4 pl-1">
          <button
            type="button"
            aria-label="Kéo danh sách tab sang trái"
            data-testid="subtabs-scroll-left"
            onClick={() => handleScrollBy('left')}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-orange-300 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/30 transition hover:scale-105 hover:from-amber-600 hover:to-orange-700 active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m14 18-6-6 6-6" />
              <path d="m19 18-6-6 6-6" opacity="0.55" />
            </svg>
          </button>
        </div>
      )}

      <nav
        ref={navRef}
        onScroll={updateScrollIndicators}
        className="flex gap-2 overflow-x-auto scroll-smooth no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        aria-label="Quản lý bán hàng"
      >
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            data-subtab-id={item.id}
            onClick={() => handleTabClick(item.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
              activeTab === item.id
                ? 'bg-emerald-700 text-white shadow'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {canScrollRight && (
        <div className="pointer-events-none absolute inset-y-1 right-1 z-10 flex items-center rounded-r-xl bg-gradient-to-l from-white via-white/95 to-transparent pl-4 pr-1">
          <button
            type="button"
            aria-label="Kéo danh sách tab sang phải"
            data-testid="subtabs-scroll-right"
            onClick={() => handleScrollBy('right')}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-orange-300 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/30 transition hover:scale-105 hover:from-amber-600 hover:to-orange-700 active:scale-95"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m10 18 6-6-6-6" />
              <path d="m5 18 6-6-6-6" opacity="0.55" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});

ScrollableSubTabs.displayName = 'ScrollableSubTabs';

export default ScrollableSubTabs;
