
import React, { useState, useRef, useEffect } from 'react';
import { HealthMetric } from '../types';
import { extractMetricsFromImage } from '../services/gemini';

interface MetricFormProps {
  onSave: (metric: Omit<HealthMetric, 'id' | 'userId'>) => void;
  onSaveBulk: (metrics: Omit<HealthMetric, 'id' | 'userId'>[]) => void;
  existingDates?: string[];
  onClose: () => void;
}

const formatDateVN = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  } catch {
    return dateStr;
  }
};

/**
 * HÀM TIỆN ÍCH NÉN ẢNH PHÍA CLIENT
 */
const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1200;
      const scale = Math.min(1, MAX_WIDTH / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, existingDates = [], onClose }) => {
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
  const [isCompressing, setIsCompressing] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Kiểm tra định dạng
    if (!file.type.startsWith('image/')) {
      setStatusMsg({ text: "⚠️ Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh.", type: 'error' });
      return;
    }

    // Cảnh báo nếu file quá lớn (> 3MB)
    if (file.size > 3 * 1024 * 1024) {
      setStatusMsg({ text: "🚀 Ảnh dung lượng lớn, Lucky đang tối ưu để xử lý nhanh hơn...", type: 'info' });
    }
    
    setIsCompressing(true);
    setBulkMode(isBulk);

    const now = new Date();
    const currentYear = now.getFullYear();

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const compressedBase64Full = await compressImage(reader.result as string);
        const compressedBase64 = compressedBase64Full.split(',')[1];
        
        setIsCompressing(false);
        setLoadingAI(true);
        setStatusMsg(null);

        if (!isBulk) {
          try {
            const extracted = await extractMetricsFromImage(compressedBase64);
            setLoadingAI(false);

            if (extracted && extracted.weight && extracted.weight > 0) {
              setFormData(prev => ({ 
                ...prev, 
                ...extracted, 
                balanceIndex: extracted.balanceIndex ?? 0, 
                date: extracted.date || prev.date 
              }));
              setStatusMsg({ 
                text: `✅ Trích xuất xong cho ngày ${formatDateVN(extracted.date || "")}!`, 
                type: 'success' 
              });
            } else {
              setStatusMsg({ text: "⚠️ Không tìm thấy chỉ số hợp lệ.", type: 'error' });
            }
          } catch (err) {
            setLoadingAI(false);
            setStatusMsg({ text: "⚠️ Lỗi phân tích ảnh.", type: 'error' });
          }
        } else {
          try {
            const res = await fetch('/api/ai/bulk-extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: compressedBase64 })
            });
            const data = await res.json();
            
            const processedData = data.filter((item: any) => item.weight && item.weight > 0).map((item: any) => {
              if (item.date && item.date.includes('/')) {
                const parts = item.date.split('/');
                const d = parseInt(parts[0]);
                const m = parseInt(parts[1]);
                const extractedDateThisYear = new Date(currentYear, m - 1, d, 23, 59, 59);
                let finalYear = currentYear;
                if (extractedDateThisYear > now) finalYear = currentYear - 1;
                item.date = `${finalYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              } else {
                item.date = now.toISOString().split('T')[0];
              }
              return { ...formData, balanceIndex: 0, ...item };
            });
            
            setLoadingAI(false);
            if (processedData.length > 0) {
              setBulkPreview(processedData);
              setStatusMsg({ text: `✅ Đã quét thành công ${processedData.length} bản ghi!`, type: 'success' });
            } else {
              setStatusMsg({ text: "⚠️ Không tìm thấy danh sách chỉ số.", type: 'error' });
            }
          } catch (err) {
            setLoadingAI(false);
            setStatusMsg({ text: "⚠️ Lỗi phân tích ảnh hàng loạt.", type: 'error' });
          }
        }
      } catch (err) {
        setIsCompressing(false);
        setStatusMsg({ text: "⚠️ Lỗi khi nén ảnh.", type: 'error' });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const metricFields = [
    { key: 'weight', label: 'Cân nặng (kg)', placeholder: '65.5' },
    { key: 'bodyFat', label: 'Mỡ cơ thể (%)', placeholder: '20.0' },
    { key: 'muscleMass', label: 'Lượng cơ (kg)', placeholder: '45.0' },
    { key: 'balanceIndex', label: 'Cân đối', placeholder: '80' },
    { key: 'visceralFat', label: 'Mỡ nội tạng', placeholder: '5' },
    { key: 'boneMinerals', label: 'Khoáng chất (kg)', placeholder: '2.5' },
    { key: 'waterPercent', label: 'Nước (%)', placeholder: '55.0' },
    { key: 'energy', label: 'Năng Lượng (kcal)', placeholder: '1500' },
    { key: 'bioAge', label: 'Tuổi sinh học', placeholder: '25' },
  ];

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
            <div className={`p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300 shadow-sm ${statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : statusMsg.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
              <div className="flex items-center gap-3">
                <span className="text-lg">{statusMsg.type === 'success' ? '✅' : statusMsg.type === 'error' ? '⚠️' : 'ℹ️'}</span>
                <span className="text-xs font-black uppercase tracking-tight">{statusMsg.text}</span>
              </div>
              <button onClick={() => setStatusMsg(null)} className="text-lg font-bold opacity-50 hover:opacity-100">&times;</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button disabled={loadingAI || isCompressing} onClick={() => { setBulkMode(false); fileInputRef.current?.click(); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${!bulkMode ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📸</span>
              <span className="font-black text-emerald-800 text-[10px] uppercase tracking-widest">Tải ảnh/Chụp InBody</span>
            </button>
            <button disabled={loadingAI || isCompressing} onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📝</span>
              <span className="font-black text-amber-800 text-[10px] uppercase tracking-widest">Quét sổ tay hàng loạt</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {(loadingAI || isCompressing) && (
            <div className="flex flex-col items-center justify-center p-12 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest text-center">
                {isCompressing ? '⏳ Ảnh dung lượng lớn, Lucky đang nén để xử lý nhanh hơn...' : '🍀 Lucky AI đang phân tích dữ liệu qua Server...'}
              </span>
            </div>
          )}

          {!loadingAI && !isCompressing && bulkMode && bulkPreview.length > 0 ? (
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
                      <th className="p-4 text-center">Tuổi SH</th>
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
              <button onClick={() => onSaveBulk(bulkPreview)} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest hover:bg-emerald-700 transition-all">Xác nhận lưu {bulkPreview.length} bản ghi</button>
            </div>
          ) : !loadingAI && !isCompressing && (
            <form onSubmit={handleSubmit} className="space-y-6">
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
               <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg hover:bg-emerald-700 transition-all uppercase tracking-widest">Lưu kết quả ngay</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricForm;
