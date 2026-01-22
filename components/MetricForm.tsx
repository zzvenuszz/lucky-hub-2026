
import React, { useState, useRef } from 'react';
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

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, existingDates = [], onClose }) => {
  const [formData, setFormData] = useState<Omit<HealthMetric, 'id' | 'userId'>>({
    date: new Date().toISOString().split('T')[0],
    weight: 0, bodyFat: 0, boneMinerals: 0, waterPercent: 0, muscleMass: 0, energy: 0, bioAge: 0, visceralFat: 0, balanceIndex: 0
  });
  const [loadingAI, setLoadingAI] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[MetricForm] ${msg}`, type);
  };

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingAI(true);
    setBulkMode(isBulk);
    setRetryCount(0);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      
      if (!isBulk) {
        log("Đang phân tích ảnh InBody (Chế độ Di động)...");
        try {
          const extracted = await extractMetricsFromImage(base64);
          if (extracted && (extracted.weight || extracted.bodyFat)) {
            setFormData(prev => ({ ...prev, ...extracted }));
            log("Trích xuất chỉ số thành công!", "success");
            alert("✅ Chúc mừng! Lucky AI đã nhận diện thành công các chỉ số. Bạn hãy kiểm tra lại và bấm 'Lưu kết quả' nhé!");
          } else {
            alert("🤔 Lucky AI chưa thể nhận diện được các con số. Bạn vui lòng chụp ảnh rõ nét hơn, tránh bị lóa đèn và bao quát toàn bộ bảng kết quả nhé!");
            log("AI trả về dữ liệu rỗng.", "error");
          }
        } catch (err) {
          alert("Lỗi phân tích. Vui lòng thử lại sau.");
        } finally {
          setLoadingAI(false);
        }
      } else {
        log("Đang phân tích bảng viết tay (Bulk)...");
        
        const executeBulkAI = async (retries = 2): Promise<void> => {
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: { 
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: base64 } }, 
                  { text: `Đọc bảng viết tay InBody. Trích xuất danh sách JSON.` }
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
                      muscleMass: { type: Type.NUMBER }
                    },
                    required: ["weight"]
                  }
                }
              }
            });

            const data = JSON.parse(cleanJsonResponse(response.text || "[]"));
            if (Array.isArray(data) && data.length > 0) {
              setBulkPreview(data.map(item => ({...formData, ...item})));
              log(`Đã đọc ${data.length} ngày thành công.`, "success");
            } else {
              throw new Error("EMPTY");
            }
          } catch (err) {
            if (retries > 0) setTimeout(() => executeBulkAI(retries - 1), 3000);
            else alert("Không thể đọc được bảng viết tay. Vui lòng chụp rõ nét hơn.");
          } finally {
            setLoadingAI(false);
          }
        };
        await executeBulkAI();
      }
    };
    reader.readAsDataURL(file);
  };

  const metricFields = [
    { key: 'weight', label: 'Cân nặng (kg)' },
    { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)' },
    { key: 'muscleMass', label: 'Cơ bắp (kg)' },
    { key: 'visceralFat', label: 'Mỡ nội tạng' },
    { key: 'energy', label: 'BMR (kcal)' },
    { key: 'bioAge', label: 'Tuổi sinh học' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold">Cập nhật chỉ số cơ thể</h2>
          <button onClick={onClose} className="text-2xl hover:scale-110 transition-transform">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6 no-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(false); fileInputRef.current?.click(); }}
              className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${!bulkMode ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-slate-200'}`}
            >
              <span className="text-4xl mb-2">📸</span>
              <span className="font-black text-emerald-800 text-xs uppercase tracking-widest">Chụp kết quả InBody</span>
            </button>
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className={`p-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center transition-all ${bulkMode ? 'border-amber-500 bg-amber-50 shadow-inner' : 'border-slate-200'}`}
            >
              <span className="text-4xl mb-2">📝</span>
              <span className="font-black text-amber-800 text-xs uppercase tracking-widest">Quét sổ tay hàng loạt</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-12 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest">Lucky AI đang phân tích hình ảnh...</span>
            </div>
          )}

          {!loadingAI && bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700">Dữ liệu quét được ({bulkPreview.length} bản ghi):</h3>
                <button onClick={() => setBulkPreview([])} className="text-[10px] font-black text-rose-500 uppercase">Hủy bỏ</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-slate-50/50 max-h-80 no-scrollbar">
                <table className="w-full text-[10px] text-left min-w-[500px]">
                  <thead className="sticky top-0 bg-white/80 backdrop-blur-md">
                    <tr className="text-slate-400 font-black uppercase border-b border-slate-100">
                      <th className="p-3">Ngày</th>
                      <th className="p-3 text-center">Cân (kg)</th>
                      <th className="p-3 text-center">Mỡ (%)</th>
                      <th className="p-3 text-center">Cơ (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white">
                        <td className="p-3 font-bold text-slate-700">{item.date}</td>
                        <td className="p-3 text-center font-black text-emerald-600">{item.weight}</td>
                        <td className="p-3 text-center font-bold text-rose-500">{item.bodyFat}%</td>
                        <td className="p-3 text-center font-bold text-blue-600">{item.muscleMass}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => onSaveBulk(bulkPreview)} className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest">Xác nhận lưu {bulkPreview.length} bản ghi</button>
            </div>
          ) : !loadingAI && (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ngày đo lường</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                </div>
                {metricFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{field.label}</label>
                    <input required type="number" step="0.1" value={(formData as any)[field.key]} onChange={e => setFormData({...formData, [field.key]: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm" />
                  </div>
                ))}
               </div>
               <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all uppercase tracking-widest active:scale-95">Lưu kết quả ngay</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricForm;
