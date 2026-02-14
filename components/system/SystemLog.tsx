
import React, { useState, useEffect, useRef, memo } from 'react';

interface LogEntry {
  id: string;
  message: string;
  type: string;
  timestamp: string;
  duration?: number;
}

const LOG_TYPES = [
  { id: 'auth', label: 'Tài khoản', color: 'text-blue-400', icon: '🔑' },
  { id: 'user', label: 'Hoạt động', color: 'text-emerald-400', icon: '👥' },
  { id: 'ai', label: 'Gemini AI', color: 'text-purple-400', icon: '🤖' },
  { id: 'database', label: 'Dữ liệu', color: 'text-amber-400', icon: '💾' },
  { id: 'system', label: 'Hệ thống', color: 'text-slate-400', icon: '⚙️' },
  { id: 'error', label: 'Lỗi', color: 'text-rose-400', icon: '❌' },
];

const SystemLog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filters, setFilters] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('lucky_log_filters');
    return saved ? JSON.parse(saved) : { auth: true, user: true, ai: true, database: true, system: true, error: true };
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('lucky_log_filters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    const handleNewLog = (e: any) => {
      const newLog = e.detail as LogEntry;
      setLogs(prev => [...prev.slice(-149), newLog]);
      
      // Tự động mở console nếu có lỗi đỏ
      if (newLog.type === 'error') setIsOpen(true);
    };

    window.addEventListener('app-system-log', handleNewLog);
    return () => window.removeEventListener('app-system-log', handleNewLog);
  }, []);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const filteredLogs = logs.filter(log => filters[log.type] || (log.type === 'info' && filters['system']));

  const clearLogs = () => setLogs([]);
  
  const toggleFilter = (type: string) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <>
      {/* Nút bấm nổi - Luôn hiển thị phía trên nút Chat (cách đáy 80px + margin) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-[88px] right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all z-[1001] border-4 border-white ${isOpen ? 'bg-slate-800 rotate-180' : 'bg-slate-700 hover:scale-110 active:scale-95'}`}
      >
        <span className="text-xl">{isOpen ? '❌' : '📟'}</span>
        {!isOpen && logs.some(l => l.type === 'error') && (
           <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full animate-ping"></span>
        )}
      </button>

      {/* Cửa sổ Console */}
      {isOpen && (
        <div className="fixed bottom-[155px] right-6 w-[400px] max-w-[90vw] h-[450px] max-h-[60vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden z-[1001] animate-in slide-in-from-bottom-4 duration-300">
          {/* Header & Filters */}
          <div className="p-5 border-b border-slate-800 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                System Terminal v3.0
              </h3>
              <button onClick={clearLogs} className="text-[9px] font-black text-rose-400 uppercase hover:text-rose-300 transition-colors">Clear All</button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {LOG_TYPES.map(type => (
                <button 
                  key={type.id}
                  onClick={() => toggleFilter(type.id)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${filters[type.id] ? 'bg-slate-800 border-slate-600' : 'bg-transparent border-transparent opacity-30'}`}
                >
                  <span className="text-xs">{type.icon}</span>
                  <span className={`text-[9px] font-black uppercase truncate ${type.color}`}>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Log List */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-5 space-y-2 no-scrollbar font-mono text-[10px] bg-slate-950/50"
          >
            {filteredLogs.map(log => {
              const typeConfig = LOG_TYPES.find(t => t.id === log.type) || LOG_TYPES[4];
              return (
                <div key={log.id} className="animate-in fade-in slide-in-from-left-2 duration-200 flex items-start gap-2 group">
                  <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], {hour12: false})}]</span>
                  <span className={`${typeConfig.color} shrink-0 font-black`}>{typeConfig.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`leading-relaxed break-words ${typeConfig.color}`}>
                      {log.message}
                    </span>
                    {log.duration && (
                      <span className="ml-2 px-1.5 py-0.5 bg-slate-800 rounded text-[8px] text-amber-400 font-black">
                        {log.duration}ms
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            
            {filteredLogs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-2">
                <span className="text-4xl">📡</span>
                <p className="text-[10px] font-black uppercase tracking-widest">Waiting for incoming signals...</p>
              </div>
            )}
          </div>
          
          <div className="p-3 bg-slate-950 border-t border-slate-800 text-center">
             <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest italic">(*) Lucky Hub Monitoring System - Do not close for debugging</p>
          </div>
        </div>
      )}
    </>
  );
};

export default memo(SystemLog);
