
import React, { useState, useRef, useEffect } from 'react';
import { HealthMetric } from '../types';
import { extractMetricsFromImage } from '../services/gemini';
import { GoogleGenAI, Type } from "@google/genai";

interface MetricFormProps {
  onSave: (metric: Omit<HealthMetric, 'id' | 'userId'>) => void;
  onSaveBulk: (metrics: Omit<HealthMetric, 'id' | 'userId'>[]) => void;
  existingDates?: string[];
  onClose: () => void;
}

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

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

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, existingDates = [], onClose }) => {
  const getTodayISO = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState<Omit<HealthMetric, 'id' | 'userId'>>({
    date: getTodayISO(),
    weight: 0, bodyFat: 0, boneMinerals: 0, waterPercent: 0, muscleMass: 0, energy: 0, bioAge: 0, visceralFat: 0, balanceIndex: 0
  });
  
  const [loadingAI, setLoadingAI] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (statusMsg) {
      const timer = setTimeout(() => setStatusMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMsg]);

  // Hàm kích hoạt trình chọn ngày một cách cưỡng bức (Dùng cho PC)
  const openDatePicker = () => {
    if (dateInputRef.current) {
      try {
        if ('showPicker' in HTMLInputElement.prototype) {
          (dateInputRef.current as any).showPicker();
        } else {
          dateInputRef.current.focus();
          dateInputRef.current.click();
        }
      } catch (e) {
        dateInputRef.current.focus();
        dateInputRef.current.click();
      }
    }
  };

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoadingAI(true);
    setBulkMode(isBulk);
    setStatusMsg(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
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
                text: `✅ Lucky AI đã trích xuất xong! (Cân nặng: ${extracted.weight}kg, Mỡ: ${extracted.bodyFat}%)`, 
                type: 'success' 
              });
            } else {
              setStatusMsg({ 
                text: "⚠️ Lucky AI không tìm thấy chỉ số sức khỏe hợp lệ. Vui lòng đảm bảo ảnh rõ nét, không bị lóa hoặc quá mờ!", 
                type: 'error' 
              });
            }
          } catch (err) {
            setLoadingAI(false);
            setStatusMsg({ text: "⚠️ Có lỗi xảy ra trong quá trình phân tích ảnh. Vui lòng thử lại!", type: 'error' });
          }
        } else {
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: { 
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: compressedBase64 } }, 
                  { text: `Đọc bảng kết quả sức khỏe. Trích xuất mảng JSON ĐẦY ĐỦ 9 CHỈ SỐ: date (YYYY-MM-DD), weight, bodyFat, muscleMass, visceralFat, boneMinerals, waterPercent, energy, bioAge, balanceIndex. NẾU KHÔNG CÓ DỮ LIỆU HỢP LỆ, TRẢ VỀ MẢNG RỖNG [].` }
                ] 
              },
              config: { 
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      date: { type: Type.STRING },
                      weight: { type: Type.NUMBER },
                      bodyFat: { type: Type.NUMBER },
                      muscleMass: { type: Type.NUMBER },
                      visceralFat: { type: Type.NUMBER },
                      boneMinerals: { type: Type.NUMBER },
                      waterPercent: { type: Type.NUMBER },
                      energy: { type: Type.NUMBER },
                      bioAge: { type: Type.NUMBER },
                      balanceIndex: { type: Type.NUMBER }
                    },
                    required: ["weight"]
                  }
                }
              }
            });
            const data = JSON.parse(cleanJsonResponse(response.text || "[]"));
            const validData = data.filter((item: any) => item.weight && item.weight > 0);
            
            setLoadingAI(false);
            if (validData.length > 0) {
              setBulkPreview(validData.map((item: any) => ({...formData, balanceIndex: 0, ...item})));
              setStatusMsg({ text: `✅ Đã quét thành công ${validData.length} bản ghi!`, type: 'success' });
            } else {
              setStatusMsg({ text: "⚠️ Không tìm thấy danh sách chỉ số hợp lệ trong ảnh quét hàng loạt.", type: 'error' });
            }
          } catch (err) {
            setLoadingAI(false);
            setStatusMsg({ text: "⚠️ Lỗi phân tích ảnh hàng loạt. Vui lòng thử lại!", type: 'error' });
          }
        }
      };
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const metricFields = [
    { key: 'weight', label: 'Cân nặng (kg)' },
    { key: 'bodyFat', label: 'Mỡ cơ thể (%)' },
    { key: 'muscleMass', label: 'Lượng cơ (kg)' },
    { key: 'balanceIndex', label: 'Cân đối' },
    { key: 'visceralFat', label: 'Mỡ nội tạng' },
    { key: 'boneMinerals', label: 'Khoáng chất (kg)' },
    { key: 'waterPercent', label: 'Nước (%)' },
    { key: 'energy', label: 'Năng Lượng (kcal)' },
    { key: 'bioAge', label: 'Tuổi sinh học' },
  ];

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
            <button disabled={loadingAI} onClick={() => { setBulkMode(false); fileInputRef.current?.click(); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${!bulkMode ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📸</span>
              <span className="font-black text-emerald-800 text-[10px] uppercase tracking-widest">Tải ảnh/Chụp InBody</span>
            </button>
            <button disabled={loadingAI} onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }} className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}>
              <span className="text-4xl mb-2">📝</span>
              <span className="font-black text-amber-800 text-[10px] uppercase tracking-widest">Quét sổ tay hàng loạt</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-12 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest">Lucky AI đang phân tích dữ liệu...</span>
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
          ) : !loadingAI && (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-3 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày đo lường (Ngày/Tháng/Năm)</label>
                  <div className="relative group overflow-hidden cursor-pointer" onClick={openDatePicker}>
                    {/* Native Input Overlay: Phủ lên trên giao diện ảo nhưng để tàng hình */}
                    <div className="w-full px-5 py-4 bg-emerald-50 text-emerald-800 rounded-2xl border-2 border-emerald-100 group-hover:bg-emerald-100 group-hover:border-emerald-300 transition-all flex items-center justify-between shadow-sm">
                      <span className="text-2xl font-black tracking-tight select-none">{formatDateVN(formData.date)}</span>
                      <span className="text-xl">📅</span>
                    </div>
                    <input 
                      ref={dateInputRef}
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
                    <input required type="number" step="0.1" value={(formData as any)[field.key]} onChange={e => setFormData({...formData, [field.key]: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm" />
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
