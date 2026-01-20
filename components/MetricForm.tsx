
import React, { useState, useRef } from 'react';
import { HealthMetric } from '../types';
import { extractMetricsFromImage } from '../services/gemini';
import { GoogleGenAI, Type } from "@google/genai";

interface MetricFormProps {
  onSave: (metric: Omit<HealthMetric, 'id' | 'userId'>) => void;
  onSaveBulk: (metrics: Omit<HealthMetric, 'id' | 'userId'>[]) => void;
  onClose: () => void;
}

const MetricForm: React.FC<MetricFormProps> = ({ onSave, onSaveBulk, onClose }) => {
  // Trình duyệt vẫn làm việc với YYYY-MM-DD nội bộ nhưng chúng ta hiển thị cho người dùng thân thiện hơn
  const [formData, setFormData] = useState<Omit<HealthMetric, 'id' | 'userId'>>({
    date: new Date().toISOString().split('T')[0],
    weight: 0, bodyFat: 0, boneMinerals: 0, waterPercent: 0, muscleMass: 0, energy: 0, bioAge: 0, visceralFat: 0
  });
  const [loadingAI, setLoadingAI] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>, isBulk: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingAI(true);
    setBulkMode(isBulk);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      
      if (!isBulk) {
        const extracted = await extractMetricsFromImage(base64);
        setFormData(prev => ({ ...prev, ...extracted }));
      } else {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }, { text: "Trích xuất danh sách các chỉ số sức khỏe từ ảnh này. Trả về một mảng JSON các đối tượng: date (YYYY-MM-DD), weight, bodyFat, muscleMass, waterPercent, visceralFat, energy." }] },
          config: { responseMimeType: "application/json" }
        });
        try {
          const data = JSON.parse(response.text || "[]");
          setBulkPreview(Array.isArray(data) ? data : []);
        } catch (err) { alert("Không thể phân tích dữ liệu hàng loạt"); }
      }
      setLoadingAI(false);
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
    { key: 'bioAge', label: 'Tuổi sinh học (tuổi)' },
  ];

  // Helper để hiển thị ngày dd/mm/yyyy từ yyyy-mm-dd
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold">Cập nhật chỉ số cơ thể</h2>
          <button onClick={onClose} className="text-2xl hover:scale-110 transition-transform">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-4 border-2 border-dashed border-emerald-200 rounded-2xl flex flex-col items-center hover:bg-emerald-50 transition-all group"
            >
              <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📸</span>
              <span className="font-bold text-emerald-700 text-sm">Chụp ảnh kết quả đơn</span>
            </button>
            <button 
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className="p-4 border-2 border-dashed border-amber-200 rounded-2xl flex flex-col items-center hover:bg-amber-50 transition-all group"
            >
              <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">📋</span>
              <span className="font-bold text-amber-700 text-sm">Phân tích danh sách (AI)</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {loadingAI && (
            <div className="flex items-center justify-center p-4 bg-emerald-50 rounded-xl animate-pulse">
              <span className="text-emerald-600 font-bold text-sm">Lucky AI đang phân tích dữ liệu...</span>
            </div>
          )}

          {bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></span>
                Dữ liệu trích xuất hàng loạt:
              </h3>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-[10px] text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black uppercase">
                      <th className="p-3">Ngày</th>
                      <th className="p-3">Cân (kg)</th>
                      <th className="p-3">Mỡ (%)</th>
                      <th className="p-3">Cơ (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-bold text-slate-600">{formatDisplayDate(item.date)}</td>
                        <td className="p-3">{item.weight}</td>
                        <td className="p-3">{item.bodyFat}</td>
                        <td className="p-3">{item.muscleMass}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => onSaveBulk(bulkPreview)} className="w-full bg-amber-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-amber-100 hover:bg-amber-600 transition-all">
                Xác nhận lưu {bulkPreview.length} kết quả
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Ngày kiểm tra (dd/mm/yyyy)</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={formData.date} 
                      onChange={e => setFormData({...formData, date: e.target.value})} 
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium" 
                    />
                    <div className="absolute right-12 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600 pointer-events-none bg-emerald-50 px-2 py-1 rounded-md">
                      {formatDisplayDate(formData.date)}
                    </div>
                  </div>
                </div>
                
                {metricFields.map(field => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 ml-1 uppercase">{field.label}</label>
                    <input 
                      required
                      type="number" step="0.1" 
                      value={(formData as any)[field.key]} 
                      onChange={e => setFormData({...formData, [field.key]: Number(e.target.value)})}
                      className="w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-sm" 
                    />
                  </div>
                ))}
               </div>
               <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-[0.98] transition-all mt-4">
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
