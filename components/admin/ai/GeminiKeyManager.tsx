
import React, { useState, useEffect, memo } from 'react';
import { GeminiKey } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface GeminiKeyManagerProps {
  onRefresh?: () => void;
}

const GeminiKeyManager: React.FC<GeminiKeyManagerProps> = () => {
  const [keys, setKeys] = useState<GeminiKey[]>([]);
  const [newKey, setNewKey] = useState({ key: '', label: '' });
  const [isChecking, setIsChecking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ status: 'none' | 'active' | 'error' }>({ status: 'none' });

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const data = await Database.getGeminiKeys();
      setKeys(data);
    } catch (err) {
      console.error("Lỗi nạp danh sách Key:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleTestKey = async () => {
    if (!newKey.key) {
      setError("Vui lòng nhập API Key để kiểm tra.");
      return;
    }
    
    setIsChecking(true);
    setError(null);
    setTestResult({ status: 'none' });
    
    try {
      const health = await Database.checkKeyHealth(newKey.key);
      if (health?.status === 'ok') {
        setTestResult({ status: 'active' });
      } else {
        setTestResult({ status: 'error' });
      }
    } catch (err: any) {
      setTestResult({ status: 'error' });
      setError(err.message || "Key không hợp lệ hoặc không hoạt động.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKey.key || !newKey.label) {
      setError("Vui lòng nhập đầy đủ nhãn và API Key.");
      return;
    }
    
    setIsChecking(true);
    setError(null);
    try {
      // 1. Kiểm tra key trước khi lưu
      const health = await Database.checkKeyHealth(newKey.key);
      if (health?.status === 'ok') {
        // 2. Lưu vào DB
        await Database.addGeminiKey(newKey);
        setNewKey({ key: '', label: '' });
        setTestResult({ status: 'none' });
        fetchKeys();
      }
    } catch (err: any) {
      setError(err.message || "Key không hợp lệ hoặc không hoạt động.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa Key này không?")) return;
    try {
      await Database.deleteGeminiKey(id);
      fetchKeys();
    } catch (err) {
      alert("Lỗi xóa key.");
    }
  };

  const handleToggleKey = async (id: string, currentStatus: boolean) => {
    try {
      await Database.toggleGeminiKey(id, !currentStatus);
      fetchKeys();
    } catch (err) {
      alert("Lỗi cập nhật trạng thái.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50/50 p-6 rounded-[2rem] border border-amber-100 space-y-4 shadow-sm">
        <h4 className="font-black text-amber-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
          <span className="text-lg">🔑</span> Quản lý Gemini API Keys
        </h4>
        <p className="text-[10px] text-amber-600 font-bold italic leading-relaxed">
          * Hệ thống sẽ tự động xoay vòng (Round-robin) giữa các key hoạt động. <br/>
          * Nếu một key gặp lỗi 429 (vượt hạn mức), nó sẽ bị tạm dừng trong 1 phút.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input 
            placeholder="Tên gợi nhớ (VD: Key dự phòng 1...)" 
            value={newKey.label} 
            onChange={e => setNewKey({...newKey, label: e.target.value})} 
            className="px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-amber-500 font-medium" 
          />
          <input 
            type="password"
            placeholder="Dán API Key vào đây..." 
            value={newKey.key} 
            onChange={e => {
              setNewKey({...newKey, key: e.target.value});
              setTestResult({ status: 'none' });
            }} 
            className="px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-amber-500 font-mono" 
          />
        </div>

        {testResult.status !== 'none' && (
          <div className="flex items-center gap-2 px-2">
             <span className="text-[10px] font-black uppercase">Trạng thái: </span>
             {testResult.status === 'active' ? (
               <span className="text-emerald-600 font-black text-[10px] animate-pulse">HOẠT ĐỘNG</span>
             ) : (
               <span className="text-rose-600 font-black text-[10px]">KEY LỖI</span>
             )}
          </div>
        )}

        {error && <p className="text-[10px] text-rose-500 font-black uppercase px-2">{error}</p>}
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleTestKey} 
            disabled={isChecking || !newKey.key}
            className="flex-1 py-4 bg-white border-2 border-amber-200 text-amber-600 rounded-2xl font-black uppercase text-[10px] shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            {isChecking ? '⏳ ĐANG TEST...' : 'KIỂM TRA KEY'}
          </button>
          <button 
            onClick={handleAddKey} 
            disabled={isChecking}
            className="flex-[2] py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {isChecking ? '⏳ ĐANG XỬ LÝ...' : 'XÁC NHẬN THÊM KEY'}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">
          {isLoading ? 'Đang tải...' : `Danh sách Key trong Database (${keys.length})`}
        </h4>
        <div className="space-y-3">
          {keys.map(k => {
            const isCooldown = k.cooldownUntil && new Date(k.cooldownUntil).getTime() > Date.now();
            return (
              <div key={k.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group hover:border-amber-200 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${k.isActive ? (isCooldown ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500') : 'bg-slate-300'}`}></span>
                    <span className="font-black text-slate-800 text-xs uppercase tracking-tight">{k.label}</span>
                    {isCooldown && (
                      <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded font-black uppercase">Đang Cooldown</span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                    {k.key.substring(0, 6)}••••••••{k.key.substring(k.key.length - 4)}
                  </div>
                  <div className="flex gap-4 mt-2">
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Lỗi liên tiếp: <span className={k.failCount > 0 ? 'text-rose-500' : ''}>{k.failCount}</span></div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase">Sử dụng cuối: {k.lastUsed ? new Date(k.lastUsed).toLocaleTimeString() : 'Chưa dùng'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                  <button 
                    onClick={() => handleToggleKey(k.id!, k.isActive)}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${k.isActive ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                  >
                    {k.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
                  </button>
                  <button 
                    onClick={() => handleDeleteKey(k.id!)}
                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
          
          {keys.length === 0 && !isLoading && (
            <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2rem] text-center">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                Chưa có Key nào được lưu trong Database. <br/>
                Hệ thống đang sử dụng Key mặc định từ .env
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(GeminiKeyManager);
