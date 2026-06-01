
import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { HealthMetric } from '../../types.ts';
import { extractMetricsFromImage } from '../../services/gemini.ts';
import { formatDateVN } from '../../utils/formatters.ts';
import LoadingButton from '../system/LoadingButton.tsx';

interface MetricFormProps {
  onSave: (metric: Omit<HealthMetric, 'id' | 'userId'>) => void;
  onSaveBulk: (metrics: Omit<HealthMetric, 'id' | 'userId'>[]) => void;
  existingDates?: string[];
  onClose: () => void;
  latestMetrics?: Partial<HealthMetric>;
}

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, existingDates = [], onClose, latestMetrics }) => {
  const getTodayISO = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState<any>({
    date: getTodayISO(),
    weight: '', bodyFat: '', boneMinerals: '', waterPercent: '', muscleMass: '', energy: '', bioAge: '', visceralFat: '', balanceIndex: ''
  });
  
  const [loadingAI, setLoadingAI] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const bulkModeRef = useRef(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedYearAI, setSelectedYearAI] = useState<string>('auto');
  const [pendingBulk, setPendingBulk] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * PHÂN TÍCH: Lỗi TypeScript xảy ra vì giá trị 'system' chưa được định nghĩa trong union type của tham số type.
   * GIẢI QUYẾT: Mở rộng kiểu dữ liệu cho tham số 'type' để bao gồm 'system', đảm bảo tương thích với window.debugLog.
   * BÁO CÁO: Đã sửa lỗi tại dòng 62 và 69, code hoạt động ổn định.
   * GỢI Ý: Nên cân nhắc gom nhóm các kiểu log vào một enum chung trong types.ts để quản lý tập trung.
   */
  const log = (msg: string, type: 'info' | 'ai' | 'error' | 'success' | 'system' = 'info') => {
    if (window.debugLog) window.debugLog(`[MetricForm] ${msg}`, type);
  };

  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoadingAI(true);
    setBulkMode(isBulk);
    setStatusMsg(null);
    log(`Bắt đầu xử lý file: ${file.name} (Chế độ: ${isBulk ? 'Hàng loạt' : 'Đơn lẻ'}, Năm chọn: ${selectedYearAI})`, 'system');

    const now = new Date();
    const currentYear = selectedYearAI === 'auto' ? now.getFullYear() : parseInt(selectedYearAI);

    const reader = new FileReader();
    reader.onloadend = async () => {
      log("Đã đọc file xong, bắt đầu nén ảnh để tối ưu payload...", "system");
      const img = new Image();
      img.src = reader.result as string;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        log("Nén ảnh thành công. Gửi dữ liệu tới Lucky AI qua Server...", "ai");

        if (!isBulk) {
          try {
            // Sử dụng service đã được cập nhật để gọi /api/ai/extract
            const extracted = await extractMetricsFromImage(compressedBase64, selectedYearAI);
            setLoadingAI(false);

            if (extracted && extracted.weight && extracted.weight > 0) {
              setFormData(prev => ({ 
                ...prev, 
                ...extracted, 
                balanceIndex: extracted.balanceIndex ?? 0, 
                date: extracted.date || prev.date 
              }));
              setStatusMsg({ 
                text: `✅ Lucky AI đã trích xuất xong cho ngày ${formatDateVN(extracted.date || "")}!`, 
                type: 'success' 
              });
            } else {
              log("AI không nhận diện được chỉ số hợp lệ trong ảnh đơn.", "error");
              setStatusMsg({ 
                text: "⚠️ Lucky AI không tìm thấy chỉ số sức khỏe hợp lệ.", 
                type: 'error' 
              });
            }
          } catch (err: any) {
            setLoadingAI(false);
            log(`Lỗi trích xuất đơn: ${err.message}`, "error");
            setStatusMsg({ text: "⚠️ Có lỗi xảy ra trong quá trình phân tích ảnh.", type: 'error' });
          }
        } else {
          // Reset bulkPreview trước khi gọi request để tránh hiển thị dữ liệu cũ
          setBulkPreview([]);
          try {
            log(`Đang gọi endpoint /api/ai/bulk-extract với năm: ${selectedYearAI}...`, "ai");
            const sessionId = localStorage.getItem('lucky_hub_session');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (sessionId) {
              headers['Authorization'] = `Bearer ${sessionId}`;
            }
            const res = await fetch('/api/ai/bulk-extract', {
              method: 'POST',
              headers,
              body: JSON.stringify({ 
                imageBase64: compressedBase64,
                selectedYear: selectedYearAI !== 'auto' ? selectedYearAI : undefined
              }),
              signal: AbortSignal.timeout(45000)
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(errBody.message || `Server trả về lỗi ${res.status}`);
            }

            const data = await res.json();
            log(`AI đã phản hồi. Nhận được ${data.length} bản ghi thô.`, "ai");
            
            const processedData = data.filter((item: any) => item.weight && item.weight > 0).map((item: any) => {
              if (item.date && item.date.includes('/')) {
                const parts = item.date.split('/');
                const d = parseInt(parts[0]);
                const m = parseInt(parts[1]);
                
                if (selectedYearAI !== 'auto') {
                  item.date = `${selectedYearAI}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                } else {
                  const extractedDateThisYear = new Date(currentYear, m - 1, d, 23, 59, 59);
                  let finalYear = currentYear;
                  if (extractedDateThisYear > now) {
                    finalYear = currentYear - 1;
                  }
                  item.date = `${finalYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                }
              } else if (!item.date) {
                item.date = now.toISOString().split('T')[0];
              }
              return { ...formData, balanceIndex: 0, ...item };
            });
            
            setLoadingAI(false);
            if (processedData.length > 0) {
              log(`Xử lý thành công ${processedData.length} bản ghi với năm ${selectedYearAI}.`, "success");
              setBulkPreview(processedData);
              setStatusMsg({ text: `✅ Đã quét thành công ${processedData.length} bản ghi!`, type: 'success' });
            } else {
              log("Không tìm thấy dòng dữ liệu nào hợp lệ sau khi filter (weight > 0).", "error");
              setStatusMsg({ text: "⚠️ Không tìm thấy danh sách chỉ số hợp lệ.", type: 'error' });
            }
          } catch (err: any) {
            setLoadingAI(false);
            log(`Lỗi phân tích hàng loạt: ${err.message}`, "error");
            setStatusMsg({ text: "⚠️ Lỗi phân tích ảnh hàng loạt: " + err.message, type: 'error' });
          }
        }
      };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const metricFields = useMemo(() => {
    const lm = latestMetrics || {};
    return [
      { key: 'weight', label: 'Cân nặng (kg)', placeholder: lm.weight ? `${lm.weight}` : '65.5' },
      { key: 'bodyFat', label: 'Mỡ cơ thể (%)', placeholder: lm.bodyFat ? `${lm.bodyFat}` : '20.0' },
      { key: 'muscleMass', label: 'Lượng cơ (kg)', placeholder: lm.muscleMass ? `${lm.muscleMass}` : '45.0' },
      { key: 'balanceIndex', label: 'Cân đối', placeholder: lm.balanceIndex ? `${lm.balanceIndex}` : '80' },
      { key: 'visceralFat', label: 'Mỡ nội tạng', placeholder: lm.visceralFat ? `${lm.visceralFat}` : '5' },
      { key: 'boneMinerals', label: 'Khoáng chất (kg)', placeholder: lm.boneMinerals ? `${lm.boneMinerals}` : '2.5' },
      { key: 'waterPercent', label: 'Nước (%)', placeholder: lm.waterPercent ? `${lm.waterPercent}` : '55.0' },
      { key: 'energy', label: 'Năng Lượng (kcal)', placeholder: lm.energy ? `${lm.energy}` : '1500' },
      { key: 'bioAge', label: 'Tuổi sinh học', placeholder: lm.bioAge ? `${lm.bioAge}` : '25' },
    ];
  }, [latestMetrics]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const requiredKeys = metricFields.map(f => f.key);
    const isInvalid = requiredKeys.some(key => {
      const val = formData[key];
      return val === '' || val === null || Number(val) <= 0;
    });

    if (isInvalid) {
      setStatusMsg({ text: "⚠️ Vui lòng nhập đầy đủ chỉ số!", type: 'error' });
      return;
    }

    const submissionData = { ...formData };
    requiredKeys.forEach(key => {
      submissionData[key] = Number(formData[key]);
    });

    onSave(submissionData);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold">Cập nhật chỉ số cơ thể</h2>
          <button onClick={onClose} className="text-2xl hover:scale-110">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6 no-scrollbar relative">
          {statusMsg && (
            <div className={`p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300 shadow-sm ${statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
              <div className="flex items-center gap-3">
                <span className="text-lg">{statusMsg.type === 'success' ? '✅' : '⚠️'}</span>
                <span className="text-xs font-black uppercase tracking-tight">{statusMsg.text}</span>
              </div>
              <button onClick={() => setStatusMsg(null)} className="text-lg font-bold opacity-50 hover:opacity-100">&times;</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button disabled={loadingAI} onClick={() => { setPendingBulk(false); setBulkMode(false); bulkModeRef.current = false; setShowYearPicker(true); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${!bulkMode ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📸</span>
              <span className="font-black text-emerald-800 text-[10px] uppercase tracking-widest">Tải ảnh/Chụp InBody</span>
            </button>
            <button disabled={loadingAI} onClick={() => { setPendingBulk(true); setBulkMode(true); bulkModeRef.current = true; setShowYearPicker(true); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📝</span>
              <span className="font-black text-amber-800 text-[10px] uppercase tracking-widest">Quét sổ tay hàng loạt</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkModeRef.current)} />
          </div>

          {showYearPicker && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-sm space-y-6 animate-in zoom-in-95 duration-200">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-slate-800">Chọn năm quét dữ liệu</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mặc định AI sẽ tự nhận diện năm</p>
                </div>

                <div className="space-y-4">
                  <div className="relative">
                    <select 
                      value={selectedYearAI} 
                      onChange={(e) => setSelectedYearAI(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 font-bold text-slate-700 outline-none focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="auto">Tự nhận diện (Mặc định)</option>
                      {[2023, 2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y.toString()}>Năm {y}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                  </div>

                  <button 
                    onClick={() => {
                      setShowYearPicker(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest"
                  >
                    Xác nhận & Chọn ảnh
                  </button>
                  <button 
                    onClick={() => setShowYearPicker(false)}
                    className="w-full bg-slate-100 text-slate-400 font-bold py-3 rounded-2xl hover:bg-slate-200 transition-all uppercase text-[10px] tracking-widest"
                  >
                    Hủy bỏ
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-12 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest">Lucky AI đang phân tích dữ liệu qua Server...</span>
            </div>
          )}

          {!loadingAI && bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700">Dữ liệu quét được ({bulkPreview.length} ngày):</h3>
                <button onClick={() => setBulkPreview([])} className="text-[10px] font-black text-rose-500 uppercase">Hủy bỏ</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/50 max-h-[450px] no-scrollbar">
                <table className="w-full text-[10px] text-left min-w-[1000px]">
                  <thead className="sticky top-0 bg-white/90 backdrop-blur-sm shadow-sm">
                    <tr className="text-slate-400 font-black uppercase border-b border-slate-100">
                      <th className="p-4">Ngày (DD/MM/YYYY)</th>
                      <th className="p-4 text-center">Cân nặng (kg)</th>
                      <th className="p-4 text-center">Mỡ cơ thể (%)</th>
                      <th className="p-4 text-center">Lượng cơ (kg)</th>
                      <th className="p-4 text-center">Cân đối</th>
                      <th className="p-4 text-center">Mỡ nội tạng</th>
                      <th className="p-4 text-center">Khoáng chất (kg)</th>
                      <th className="p-4 text-center">Nước (%)</th>
                      <th className="p-4 text-center">Năng Lượng</th>
                      <th className="p-4 text-center">Tuổi sinh học</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="p-4 font-bold text-slate-700">{formatDateVN(item.date)}</td>
                        <td className="p-4 text-center font-black text-emerald-600">{item.weight}</td>
                        <td className="p-4 text-center font-bold text-rose-500">{item.bodyFat}%</td>
                        <td className="p-4 text-center font-bold text-blue-600">{item.muscleMass}</td>
                        <td className="p-4 text-center font-bold text-indigo-600">{item.balanceIndex ?? 0}</td>
                        <td className="p-4 text-center font-bold text-amber-600">{item.visceralFat}</td>
                        <td className="p-4 text-center text-slate-500">{item.boneMinerals}</td>
                        <td className="p-4 text-center text-sky-600">{item.waterPercent}%</td>
                        <td className="p-4 text-center text-slate-500">{item.energy}</td>
                        <td className="p-4 text-center font-bold text-slate-700">{item.bioAge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <LoadingButton onClick={() => onSaveBulk(bulkPreview)} variant="primary" size="lg" loadingText="Đang lưu..." className="!w-full">
                Xác nhận lưu {bulkPreview.length} bản ghi
              </LoadingButton>
            </div>
          ) : !loadingAI && (
            <form id="metric-form" onSubmit={handleSubmit} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-3 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày đo lường (Ngày/Tháng/Năm)</label>
                  <div className="relative group overflow-hidden">
                    <div className="w-full px-5 py-4 bg-emerald-50 text-emerald-800 rounded-2xl border-2 border-emerald-100 group-hover:bg-emerald-100 group-hover:border-emerald-300 transition-all flex items-center justify-between shadow-sm pointer-events-none">
                      <span className="text-2xl font-black tracking-tight select-none">{formatDateVN(formData.date)}</span>
                      <span className="text-xl">📅</span>
                    </div>
                    <input 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                  </div>
                </div>

                {metricFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{field.label}</label>
                    <input 
                      required 
                      type="number" 
                      step="0.1" 
                      placeholder={field.placeholder}
                      value={(formData as any)[field.key]} 
                      onChange={e => setFormData({...formData, [field.key]: e.target.value})} 
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm" 
                    />
                  </div>
                ))}
               </div>
               <LoadingButton type="submit" variant="primary" size="lg" loadingText="Đang lưu..." className="!w-full">
                 Lưu kết quả ngay
               </LoadingButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(MetricForm);
