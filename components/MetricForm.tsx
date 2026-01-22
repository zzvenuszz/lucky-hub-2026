
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
        log("Đang phân tích ảnh kết quả đơn...");
        const extracted = await extractMetricsFromImage(base64);
        // Kiểm tra xem AI có trích xuất được chỉ số cốt lõi không
        if (extracted && (extracted.weight || extracted.bodyFat || extracted.muscleMass)) {
          setFormData(prev => ({ ...prev, ...extracted }));
          log("Trích xuất chỉ số thành công.", "success");
        } else {
          alert("Chào bạn, Lucky AI chưa thể nhận diện được các chỉ số từ hình ảnh này. Bạn vui lòng chụp ảnh rõ nét hơn, đủ ánh sáng và bao quát bảng kết quả đo để hệ thống xử lý tốt nhất nhé! 😊✨");
          log("AI không tìm thấy dữ liệu hợp lệ trong ảnh.", "error");
        }
        setLoadingAI(false);
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
                  { text: `Bạn là chuyên gia OCR y tế chuyên đọc bảng viết tay InBody. Hãy trích xuất dữ liệu và trả về mảng JSON chuẩn.` }
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
                      energy: { type: Type.NUMBER },
                      bioAge: { type: Type.NUMBER }
                    },
                    required: ["weight"]
                  }
                }
              }
            });

            const data = JSON.parse(cleanJsonResponse(response.text || "[]"));
            
            if (Array.isArray(data) && data.length > 0) {
              const cleanedData = data.map((item: any) => ({
                date: item.date || new Date().toISOString().split('T')[0],
                weight: parseFloat(String(item.weight).replace(',', '.')) || 0,
                bodyFat: parseFloat(String(item.bodyFat).replace(',', '.')) || 0,
                muscleMass: parseFloat(String(item.muscleMass).replace(',', '.')) || 0,
                waterPercent: 0, visceralFat: item.visceralFat || 0, energy: item.energy || 0, balanceIndex: 0, bioAge: item.bioAge || 0, boneMinerals: 0
              })).filter(item => item.weight > 0);

              if (cleanedData.length > 0) {
                setBulkPreview(cleanedData);
                log(`Đã đọc thành công ${cleanedData.length} bản ghi.`, "success");
              } else {
                throw new Error("NO_VALID_DATA");
              }
            } else {
              throw new Error("NO_VALID_DATA");
            }
            setLoadingAI(false);
          } catch (err: any) { 
            if (retries > 0 && (err.message?.includes('429') || err.message?.includes('limit'))) {
              setRetryCount(prev => prev + 1);
              setTimeout(() => executeBulkAI(retries - 1), 3000);
            } else {
              alert("Chào bạn, Lucky AI gặp khó khăn khi đọc bảng viết tay này. Bạn vui lòng chụp ảnh thẳng góc, đủ ánh sáng và đảm bảo các con số viết tay rõ ràng để hệ thống hỗ trợ bạn nhập liệu hàng loạt nhé! 📝💪");
              log("Phân tích Bulk thất bại hoặc không có dữ liệu.", "error");
              setLoadingAI(false);
            }
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
    { key: 'muscleMass', label: 'Khối lượng cơ (kg)' },
    { key: 'waterPercent', label: 'Tỉ lệ nước (%)' },
    { key: 'visceralFat', label: 'Mỡ nội tạng' },
    { key: 'energy', label: 'BMR (kcal)' },
    { key: 'boneMinerals', label: 'Khối lượng xương (kg)' },
    { key: 'balanceIndex', label: 'Chỉ số cân đối' },
    { key: 'bioAge', label: 'Tuổi sinh học' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold">Cập nhật chỉ số cơ thể</h2>
          <button onClick={onClose} className="text-2xl hover:scale-110 transition-transform">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6 no-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(false); fileInputRef.current?.click(); }}
              className={`p-5 border-2 border-dashed rounded-2xl flex flex-col items-center transition-all group ${!bulkMode ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-200'}`}
            >
              <span className="text-3xl mb-1">📸</span>
              <span className="font-bold text-emerald-700 text-sm uppercase tracking-tighter">Chụp InBody đơn lẻ</span>
            </button>
            <button 
              disabled={loadingAI}
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className={`p-5 border-2 border-dashed rounded-2xl flex flex-col items-center transition-all group ${bulkMode ? 'border-amber-500 bg-amber-50' : 'border-amber-200'}`}
            >
              <span className="text-3xl mb-1">📝</span>
              <span className="font-bold text-amber-700 text-sm uppercase tracking-tighter">Quét Sổ tay hàng loạt</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex flex-col items-center justify-center p-12 bg-emerald-50 rounded-3xl border border-emerald-100 animate-pulse">
              <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <span className="text-emerald-700 font-black text-sm uppercase tracking-widest">Lucky AI đang phân tích hình ảnh...</span>
            </div>
          )}

          {!loadingAI && bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-700">Dữ liệu quét được ({bulkPreview.length} ngày):</h3>
                <button onClick={() => setBulkPreview([])} className="text-[10px] font-black text-rose-500 uppercase">Hủy bỏ</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50/50 max-h-80 scrollbar-hide">
                <table className="w-full text-[10px] text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-white/80 backdrop-blur-sm text-slate-400 font-black uppercase sticky top-0 z-10">
                      <th className="p-3 border-b">Ngày đo</th>
                      <th className="p-3 border-b text-center">Cân (kg)</th>
                      <th className="p-3 border-b text-center">Mỡ (%)</th>
                      <th className="p-3 border-b text-center">Cơ (kg)</th>
                      <th className="p-3 border-b text-center">Mỡ NT</th>
                      <th className="p-3 border-b text-center">BMR</th>
                      <th className="p-3 border-b text-center">Tuổi SH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white transition-colors">
                        <td className="p-3 font-bold text-slate-700">{item.date}</td>
                        <td className="p-3 text-center font-black text-emerald-600 bg-emerald-50/20">{item.weight}</td>
                        <td className="p-3 text-center font-bold text-rose-500">{item.bodyFat}%</td>
                        <td className="p-3 text-center font-bold text-blue-600">{item.muscleMass}</td>
                        <td className="p-3 text-center text-amber-600 font-bold">{item.visceralFat}</td>
                        <td className="p-3 text-center text-slate-500">{item.energy}</td>
                        <td className="p-3 text-center text-slate-500">{item.bioAge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button 
                onClick={() => onSaveBulk(bulkPreview)} 
                className="w-full bg-amber-500 text-white font-black py-5 rounded-2xl shadow-xl shadow-amber-100 uppercase tracking-widest hover:bg-amber-600 transition-all"
              >
                Xác nhận lưu {bulkPreview.length} ngày vào hệ thống
              </button>
            </div>
          ) : !loadingAI && (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Ngày đo lường</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
                </div>
                
                {metricFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase">{field.label}</label>
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
               <button type="submit" className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all mt-4 uppercase tracking-widest">Lưu kết quả đo lường</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricForm;
