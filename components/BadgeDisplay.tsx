
import React, { useState } from 'react';
import { Badge } from '../types.ts';
import { BADGES_DB } from '../services/database.ts';

interface BadgeDisplayProps {
  badgeIds: string[];
  size?: 'sm' | 'md';
}

const BadgeDisplay: React.FC<BadgeDisplayProps> = ({ badgeIds, size = 'sm' }) => {
  const [activeBadge, setActiveBadge] = useState<Badge | null>(null);

  if (!badgeIds || badgeIds.length === 0) return null;

  const userBadges = badgeIds
    .map(id => BADGES_DB.find(b => b.id === id))
    .filter((b): b is Badge => !!b);

  return (
    <div className="flex flex-wrap gap-1 items-center relative">
      {userBadges.map(badge => (
        <div 
          key={badge.id}
          className={`cursor-pointer flex items-center gap-1 rounded-full px-2 py-0.5 text-white font-black uppercase tracking-tighter ${badge.color} hover:scale-105 transition-all shadow-sm ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}
          onClick={(e) => {
            e.stopPropagation();
            setActiveBadge(activeBadge?.id === badge.id ? null : badge);
          }}
        >
          <span>{badge.icon}</span>
          <span className="hidden sm:inline">{badge.name}</span>
        </div>
      ))}

      {activeBadge && (
        <div className="absolute bottom-full mb-2 left-0 w-48 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl z-[100] animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{activeBadge.icon}</span>
            <span className="font-black text-[10px] uppercase tracking-widest text-emerald-400">{activeBadge.name}</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-300 font-medium italic">
            "{activeBadge.description}"
          </p>
          <div className="absolute top-full left-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900"></div>
          <button 
            className="absolute -top-1 -right-1 bg-white/20 hover:bg-white/40 w-4 h-4 rounded-full text-[8px] flex items-center justify-center"
            onClick={(e) => { e.stopPropagation(); setActiveBadge(null); }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default BadgeDisplay;
