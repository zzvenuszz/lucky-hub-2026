
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
        log("LỖI: Không tìm thấy API KEY trong hệ thống", "error");
        setLoadingAI(false);
        return;
      }
      
      if (!isBulk) {
        log("Đang phân tích ảnh đơn lẻ...");
        const extracted = await extractMetricsFromImage(base64);
        setFormData(prev => ({ ...prev, ...extracted }));
        setLoadingAI(false);
      } else {
        log("Đang phân tích ảnh danh sách (Bulk)...");
        try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [{ 
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: base64 } }, 
                { text: "Bạn là chuyên gia OCR. Hãy trích xuất danh sách chỉ số InBody từ ảnh bảng dữ liệu. BẮT BUỘC trích xuất 10 chỉ số cho mỗi dòng. Nếu dòng nào thiếu 'date', hãy lấy ngày hôm nay. Nếu thiếu bất kỳ chỉ số nào khác, hãy để giá trị 0. Trả về mảng JSON." }
              ] 
            }],
            config: { 
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING, description: "Định dạng YYYY-MM-DD" },
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
                  required: ["weight"] // Chỉ bắt buộc cân nặng để giảm thiểu lỗi dừng đột ngột
                }
              }
            }
          });

          const rawText = response.text || "[]";
          const cleanedText = cleanJsonResponse(rawText);
          const data = JSON.parse(cleanedText);
          
          if (!Array.isArray(data)) throw new Error("Kết quả AI không phải là một danh sách.");

          const cleanedData = data.map((item: any) => ({
            date: item.date || new Date().toISOString().split('T')[0],
            weight: Number(item.weight) || 0,
            bodyFat: Number(item.bodyFat) || 0,
            muscleMass: Number(item.muscleMass) || 0,
            waterPercent: Number(item.waterPercent) || 0,
            visceralFat: Number(item.visceralFat) || 0,
            energy: Number(item.energy) || 0,
            balanceIndex: Number(item.balanceIndex) || 0,
            bioAge: Number(item.bioAge) || 0,
            boneMinerals: Number(item.boneMinerals) || 0
          }));

          setBulkPreview(cleanedData);
          log(`Đã trích xuất thành công ${cleanedData.length} dòng dữ liệu.`, "success");
        } catch (err: any) { 
          log(`LỖI PHÂN TÍCH: ${err.message}`, "error");
          alert("Không thể phân tích dữ liệu hàng loạt. Vui lòng kiểm tra chất lượng ảnh hoặc thử lại."); 
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
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
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
              <span className="font-bold text-emerald-700 text-sm">Chụp ảnh kết quả đơn</span>
            </button>
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className={`p-4 border-2 border-dashed rounded-2xl flex flex-col items-center transition-all group ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-amber-200 hover:bg-amber-50 opacity-50'}`}
            >
              <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📋</span>
              <span className="font-bold text-amber-700 text-sm">Phân tích danh sách (Bulk)</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-8 bg-emerald-50 rounded-2xl border border-emerald-100 animate-pulse">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-xs uppercase tracking-widest">Lucky AI đang quét dữ liệu bảng...</span>
              <p className="text-[10px] text-emerald-500 mt-2 italic font-medium">Vui lòng đợi trong giây lát</p>
            </div>
          )}

          {!loadingAI && bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                  Dữ liệu trích xuất ({bulkPreview.length} bản ghi):
                </h3>
                <button onClick={() => setBulkPreview([])} className="text-[10px] font-black text-rose-500 uppercase">Xóa hết</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-inner bg-slate-50/50">
                <table className="w-full text-[10px] text-left min-w-[900px]">
                  <thead>
                    <tr className="bg-white/80 backdrop-blur-sm text-slate-400 font-black uppercase sticky top-0">
                      <th className="p-3 border-b">Ngày đo</th>
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
                        <td className="p-3 text-center font-medium">{item.bodyFat}%</td>
                        <td className="p-3 text-center font-medium text-blue-600">{item.muscleMass}</td>
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
                Xác nhận lưu {bulkPreview.length} kết quả vào hệ thống
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
