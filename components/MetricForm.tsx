
import React, { useState, useRef } from 'react';
import { HealthMetric } from '../types';
import { extractMetricsFromImage } from '../services/gemini';
import { GoogleGenAI, Type } from "@google/genai";

interface MetricFormProps {
  onSave: (metric: Omit<HealthMetric, 'id' | 'userId'>) => void;
  onSaveBulk: (metrics: Omit<HealthMetric, 'id' | 'userId'>[]) => void;
  onClose: () => void;
}

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, onClose }) => {
  const [formData, setFormData] = useState<Omit<HealthMetric, 'id' | 'userId'>>({
    date: new Date().toISOString().split('T')[0],
    weight: 0, bodyFat: 0, boneMinerals: 0, waterPercent: 0, muscleMass: 0, energy: 0, bioAge: 0, visceralFat: 0, balanceIndex: 0
  });
  const [loadingAI, setLoadingAI] = useState(false);
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

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const apiKey = (window as any).process?.env?.API_KEY;

      if (!apiKey) {
        log("LỖI: Không tìm thấy API KEY", "error");
        setLoadingAI(false);
        return;
      }
      
      if (!isBulk) {
        log("Đang phân tích ảnh kết quả đơn...");
        const extracted = await extractMetricsFromImage(base64);
        setFormData(prev => ({ ...prev, ...extracted }));
        setLoadingAI(false);
      } else {
        log("Đang phân tích bảng viết tay (Bulk)...");
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ 
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64 } }, 
                { text: `Bạn là chuyên gia OCR y tế chuyên đọc bảng viết tay. Hãy trích xuất dữ liệu từ ảnh bảng InBody.
Ánh xạ các cột Tiếng Việt sang JSON như sau:
- "Ngày kiểm tra" -> date (Nếu ghi "13/1" hãy chuyển thành "2026-01-13")
- "Cân nặng (kg)" -> weight
- "Mỡ cơ thể (%)" -> bodyFat
- "Khoáng chất" -> boneMinerals
- "Chỉ số Nước (%)" -> waterPercent
- "Lượng cơ bắp" -> muscleMass
- "Chỉ số cân đối" -> balanceIndex
- "Năng lượng" -> energy
- "Tuổi sinh học" -> bioAge
- "Mỡ Nội Tạng" -> visceralFat

LƯU Ý QUAN TRỌNG:
1. Dấu phẩy (ví dụ 47,9) là dấu thập phân, hãy chuyển thành dấu chấm (47.9).
2. Bỏ qua các hàng trống không có dữ liệu.
3. Nếu thiếu cột nào, hãy để giá trị 0. 
4. Năm mặc định là 2026.` }
              ] 
            }],
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
                    waterPercent: { type: Type.NUMBER },
                    visceralFat: { type: Type.NUMBER },
                    energy: { type: Type.NUMBER },
                    balanceIndex: { type: Type.NUMBER },
                    bioAge: { type: Type.NUMBER },
                    boneMinerals: { type: Type.NUMBER }
                  },
                  required: ["weight"]
                }
              }
            }
          });

          const rawText = response.text || "[]";
          const cleanedText = cleanJsonResponse(rawText);
          const data = JSON.parse(cleanedText);
          
          if (!Array.isArray(data)) throw new Error("Kết quả AI không đúng định dạng mảng.");

          const cleanedData = data.map((item: any) => ({
            date: item.date || new Date().toISOString().split('T')[0],
            weight: parseFloat(String(item.weight).replace(',', '.')) || 0,
            bodyFat: parseFloat(String(item.bodyFat).replace(',', '.')) || 0,
            muscleMass: parseFloat(String(item.muscleMass).replace(',', '.')) || 0,
            waterPercent: parseFloat(String(item.waterPercent).replace(',', '.')) || 0,
            visceralFat: parseFloat(String(item.visceralFat).replace(',', '.')) || 0,
            energy: parseFloat(String(item.energy).replace(',', '.')) || 0,
            balanceIndex: parseFloat(String(item.balanceIndex).replace(',', '.')) || 0,
            bioAge: parseFloat(String(item.bioAge).replace(',', '.')) || 0,
            boneMinerals: parseFloat(String(item.boneMinerals).replace(',', '.')) || 0
          })).filter(item => item.weight > 0); // Lọc bỏ các dòng lỗi không có cân nặng

          setBulkPreview(cleanedData);
          log(`Đã đọc được ${cleanedData.length} ngày từ sổ tay.`, "success");
        } catch (err: any) { 
          log(`LỖI PHÂN TÍCH: ${err.message}`, "error");
          alert("Lỗi phân tích sổ tay. Hãy đảm bảo ảnh chụp đủ sáng và rõ nét."); 
        } finally {
          setLoadingAI(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const metricFields = [
    { key: 'weight', label: 'Cân nặng (kg)' },
    { key: 'bodyFat', label: 'Tỉ lệ mỡ (%)' },
    { key: 'muscleMass', label: 'Khối lượng cơ (kg)' },
    { key: 'waterPercent', label: 'Tỉ lệ nước (%)' },
    { key: 'visceralFat', label: 'Mỡ nội tạng (level)' },
    { key: 'energy', label: 'Năng lượng chuyển hóa (kcal)' },
    { key: 'boneMinerals', label: 'Khối lượng xương (kg)' },
    { key: 'balanceIndex', label: 'Chỉ số cân đối (0-100)' },
    { key: 'bioAge', label: 'Tuổi sinh học (tuổi)' },
  ];

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    } catch (e) { return dateStr; }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold">Cập nhật chỉ số cơ thể</h2>
          <button onClick={onClose} className="text-2xl hover:scale-110 transition-transform">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(false); fileInputRef.current?.click(); }}
              className={`p-4 border-2 border-dashed rounded-2xl flex flex-col items-center transition-all group ${!bulkMode ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-200 hover:bg-emerald-50 opacity-50'}`}
            >
              <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📸</span>
              <span className="font-bold text-emerald-700 text-sm uppercase tracking-tighter">Chụp kết quả đo InBody</span>
            </button>
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className={`p-4 border-2 border-dashed rounded-2xl flex flex-col items-center transition-all group ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-amber-200 hover:bg-amber-50 opacity-50'}`}
            >
              <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📝</span>
              <span className="font-bold text-amber-700 text-sm uppercase tracking-tighter">Quét bảng sổ tay (Bulk)</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-10 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-sm uppercase tracking-widest text-center">Lucky AI đang giải mã chữ viết tay...</span>
              <p className="text-xs text-emerald-500 mt-2 italic font-medium">Quá trình này có thể mất 5-10 giây tùy độ phức tạp của bảng</p>
            </div>
          )}

          {!loadingAI && bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                  Bảng dữ liệu đã đọc ({bulkPreview.length} ngày):
                </h3>
                <button onClick={() => setBulkPreview([])} className="text-[10px] font-black text-rose-500 uppercase">Hủy kết quả</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50/50 max-h-80">
                <table className="w-full text-[10px] text-left min-w-[900px]">
                  <thead>
                    <tr className="bg-white/80 backdrop-blur-sm text-slate-400 font-black uppercase sticky top-0 z-10">
                      <th className="p-3 border-b">Ngày</th>
                      <th className="p-3 border-b text-center">Cân (kg)</th>
                      <th className="p-3 border-b text-center">Mỡ (%)</th>
                      <th className="p-3 border-b text-center">Cơ (kg)</th>
                      <th className="p-3 border-b text-center">Xương (kg)</th>
                      <th className="p-3 border-b text-center">Nước (%)</th>
                      <th className="p-3 border-b text-center">Mỡ NT</th>
                      <th className="p-3 border-b text-center">BMR</th>
                      <th className="p-3 border-b text-center">Cân đối</th>
                      <th className="p-3 border-b text-center">Tuổi SH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="p-3 font-bold text-slate-700">{formatDisplayDate(item.date)}</td>
                        <td className="p-3 text-center font-black text-emerald-600 bg-emerald-50/20">{item.weight}</td>
                        <td className="p-3 text-center font-bold text-rose-500">{item.bodyFat}%</td>
                        <td className="p-3 text-center font-bold text-blue-600">{item.muscleMass}</td>
                        <td className="p-3 text-center text-slate-500">{item.boneMinerals}</td>
                        <td className="p-3 text-center text-slate-500">{item.waterPercent}%</td>
                        <td className="p-3 text-center font-bold text-amber-600">{item.visceralFat}</td>
                        <td className="p-3 text-center text-slate-500">{item.energy}</td>
                        <td className="p-3 text-center font-black text-indigo-500">{item.balanceIndex}</td>
                        <td className="p-3 text-center text-slate-500">{item.bioAge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button 
                onClick={() => onSaveBulk(bulkPreview)} 
                className="w-full bg-amber-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-amber-100 hover:bg-amber-600 hover:scale-[1.01] active:scale-[0.98] transition-all uppercase tracking-widest"
              >
                Xác nhận lưu {bulkPreview.length} ngày vào biểu đồ
              </button>
            </div>
          ) : !loadingAI && (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-tighter">Ngày đo lường (YYYY-MM-DD)</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-emerald-600 pointer-events-none bg-emerald-100/50 px-2 py-1 rounded-lg uppercase">
                      Hôm nay: {formatDisplayDate(formData.date)}
                    </div>
                  </div>
                </div>
                
                {metricFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">{field.label}</label>
                    <input 
                      required
                      type="number" step="0.1" 
                      value={(formData as any)[field.key]} 
                      onChange={e => setFormData({...formData, [field.key]: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm" 
                    />
                  </div>
                ))}
               </div>
               <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-[0.98] transition-all mt-4 uppercase tracking-widest">
                Lưu kết quả đo lường
               </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricForm;
