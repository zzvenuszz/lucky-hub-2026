
import React, { useState, useEffect, memo } from 'react';
import { GeminiKey } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

const GeminiConfig: React.FC = () => {
  const [keys, setKeys] = useState<GeminiKey[]>([]);
  const [newKey, setNewKey] = useState({ key: '', name: '' });
  const [isLoading, setIsLoading] = useState(false);

  const loadKeys = async () => {
    const data = await Database.getGeminiKeys();
    setKeys(data);
  };

  useEffect(() => { loadKeys(); }, []);

  const handleAddKey = async () => {
    if (!newKey.key || !newKey.name) return;
    setIsLoading(true);
    /**
     * PHÂN TÍCH: Database.addGeminiKey yêu cầu type Omit<GeminiKey, 'id' | '_id'>, 
     * trong đó thuộc tính 'status' là bắt buộc.
     * GIẢI QUYẾT: Bổ sung status: 'active' mặc định khi gửi yêu cầu lưu key mới.
     */
    await Database.addGeminiKey({ ...newKey, status: 'active' });
    setNewKey({ key: '', name: '' });
    await loadKeys();
    setIsLoading(false);
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Xóa API Key này? Hệ thống sẽ mất đi một tài nguyên xử lý AI.')) return;
    await Database.deleteGeminiKey(id);
    await loadKeys();
  };

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="bg-emerald-50/50 p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-100">🔑</div>
          <div>
            <h3 className="font-black text-emerald-800 uppercase tracking-widest text-sm">Thêm API Key mới</h3>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tight mt-1">Gợi ý: Sử dụng tài khoản Google khác nhau để tăng hạn mức miễn phí.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tên gợi nhớ (Ví dụ: Key của Huy)</label>
            <input 
              value={newKey.name} 
              onChange={e => setNewKey({...newKey, name: e.target.value})} 
              className="w-full px-5 py-3.5 bg-white rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-xs shadow-sm"
              placeholder="Nhập tên..."
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Chuỗi API Key (Bắt đầu bằng AIza...)</label>
            <input 
              type="password"
              value={newKey.key} 
              onChange={e => setNewKey({...newKey, key: e.target.value})} 
              className="w-full px-5 py-3.5 bg-white rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-xs shadow-sm"
              placeholder="Dán mã key tại đây..."
            />
          </div>
        </div>
        <button 
          onClick={handleAddKey} 
          disabled={isLoading}
          className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {isLoading ? 'ĐANG LƯU...' : 'CẤU HÌNH KEY VÀO HỆ THỐNG'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-4">
          <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Danh sách Keys hiện tại ({keys.length})</h4>
          <span className="text-[9px] font-black text-emerald-500 uppercase italic">Ưu tiên hơn Key trong .env</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {keys.map(k => (
            <div key={k.id || k._id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                  k.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 
                  k.status === 'error' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'
                }`}>
                  {k.status === 'active' ? '✅' : k.status === 'error' ? '❌' : '⏳'}
                </div>
                <div>
                  <div className="font-black text-slate-800 text-xs uppercase tracking-tight">{k.name}</div>
                  <div className="text-[9px] font-bold text-slate-400 mt-1">
                    {k.key.substring(0, 12)}****************{k.key.substring(k.key.length - 4)}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDeleteKey(k.id || k._id!)} 
                className="p-3 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                🗑️
              </button>
            </div>
          ))}
          {keys.length === 0 && (
            <div className="col-span-2 p-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200 text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chưa có API Key nào trong Database. Hệ thống đang sử dụng Fallback ENV.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(GeminiConfig);
