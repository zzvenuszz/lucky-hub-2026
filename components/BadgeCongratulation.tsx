
import React from 'react';
import { Badge } from '../types.ts';

interface BadgeCongratulationProps {
  badge: Badge;
  onClose: () => void;
}

const BadgeCongratulation: React.FC<BadgeCongratulationProps> = ({ badge, onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 text-center relative">
        {/* Background Decor */}
        <div className={`h-40 ${badge.color} flex items-center justify-center relative`}>
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent animate-pulse"></div>
          <div className="text-7xl drop-shadow-2xl animate-bounce-short">{badge.icon}</div>
        </div>
        
        <div className="p-8 space-y-4">
          <div className="space-y-1">
            <h2 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Thành tựu mới!</h2>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">
              Chúc mừng bạn đã đạt danh hiệu <br/>
              <span className="text-emerald-600">"{badge.name}"</span>
            </h3>
          </div>
          
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 italic text-sm text-slate-600 leading-relaxed">
            "{badge.description}"
          </div>
          
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Hành trình chăm sóc sức khỏe của bạn thật tuyệt vời!
          </p>
          
          <button 
            onClick={onClose}
            className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl hover:bg-slate-800 active:scale-95 transition-all uppercase tracking-widest text-xs"
          >
            Tuyệt vời, cảm ơn!
          </button>
        </div>
        
        {/* Confetti Emojis decoration */}
        <div className="absolute top-4 left-4 text-xl animate-ping opacity-50">✨</div>
        <div className="absolute top-10 right-8 text-xl animate-bounce opacity-50 delay-75">🎉</div>
        <div className="absolute bottom-10 left-8 text-xl animate-bounce opacity-50 delay-150">🎊</div>
      </div>
    </div>
  );
};

export default BadgeCongratulation;
