
import React, { useState, useRef, useEffect } from 'react';
import { Badge } from '../types.ts';
import { BADGES_DB } from '../services/database.ts';

interface BadgeDisplayProps {
  badgeIds: string[];
  size?: 'sm' | 'md';
}

const BadgeDisplay: React.FC<BadgeDisplayProps> = ({ badgeIds, size = 'sm' }) => {
  const [activeBadgeId, setActiveBadgeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!badgeIds || badgeIds.length === 0) return null;

  const userBadges = badgeIds
    .map(id => BADGES_DB.find(b => b.id === id))
    .filter((b): b is Badge => !!b);

  // Xử lý Click Outside: Đóng tooltip khi nhấn ra ngoài vùng Badge
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveBadgeId(null);
      }
    };

    if (activeBadgeId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeBadgeId]);

  return (
    <div className="flex flex-wrap gap-1 items-center" ref={containerRef}>
      {userBadges.map(badge => (
        <div 
          key={badge.id} 
          className="relative"
          onMouseEnter={() => setActiveBadgeId(badge.id)}
          onMouseLeave={() => setActiveBadgeId(null)}
        >
          <div 
            tabIndex={0}
            className={`cursor-pointer flex items-center gap-1 rounded-full px-2 py-0.5 text-white font-black uppercase tracking-tighter ${badge.color} hover:scale-105 focus:scale-105 focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 outline-none transition-all shadow-sm ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveBadgeId(activeBadgeId === badge.id ? null : badge.id);
            }}
            onFocus={() => setActiveBadgeId(badge.id)}
            onBlur={() => setActiveBadgeId(null)}
          >
            <span>{badge.icon}</span>
            <span className="hidden sm:inline">{badge.name}</span>
          </div>

          {activeBadgeId === badge.id && (
            <div 
              className="absolute top-full mt-2 right-0 sm:right-auto sm:left-0 w-48 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl z-[100] animate-in zoom-in-95 duration-200 pointer-events-auto"
              onClick={(e) => e.stopPropagation()} // Ngăn chặn tooltip tự đóng khi nhấn vào nội dung bên trong
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{badge.icon}</span>
                <span className="font-black text-[10px] uppercase tracking-widest text-emerald-400">{badge.name}</span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-300 font-medium italic">
                "{badge.description}"
              </p>
              {/* Mũi tên trỏ thẳng lên Badge phía trên - Căn phải trên mobile, căn trái trên desktop */}
              <div className="absolute bottom-full right-3 sm:right-auto sm:left-3 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-900"></div>
              <button 
                className="absolute -top-1 -right-1 bg-white/20 hover:bg-white/40 w-4 h-4 rounded-full text-[8px] flex items-center justify-center transition-colors"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveBadgeId(null); 
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default BadgeDisplay;
