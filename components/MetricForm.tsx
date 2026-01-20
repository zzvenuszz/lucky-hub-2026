
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
        // Custom Bulk extraction call
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }, { text: "Trích xuất danh sách các chỉ số sức khỏe từ ảnh này. Trả về một mảng JSON các đối tượng: date, weight, bodyFat, muscleMass, waterPercent, visceralFat, energy." }] },
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold">Cập nhật chỉ số</h2>
          <button onClick={onClose} className="text-2xl">&times;</button>
        </div>

        <div className="p-8 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-4 border-2 border-dashed border-emerald-200 rounded-2xl flex flex-col items-center hover:bg-emerald-50 transition-all"
            >
              <span className="text-2xl mb-1">📸</span>
              <span className="font-bold text-emerald-700">Phân tích 1 kết quả</span>
            </button>
            <button 
              onClick={() => { setBulkMode(true); fileInputRef.current?.click(); }}
              className="p-4 border-2 border-dashed border-amber-200 rounded-2xl flex flex-col items-center hover:bg-amber-50 transition-all"
            >
              <span className="text-2xl mb-1">📋</span>
              <span className="font-bold text-amber-700">Thêm hàng loạt (AI)</span>
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleAIUpload(e, bulkMode)} />
          </div>

          {bulkMode && bulkPreview.length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700">Dữ liệu hàng loạt đã trích xuất:</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50"><th>Ngày</th><th>Cân</th><th>Mỡ</th><th>Cơ</th></tr></thead>
                  <tbody>
                    {bulkPreview.map((item, idx) => (
                      <tr key={idx}><td>{item.date}</td><td>{item.weight}kg</td><td>{item.bodyFat}%</td><td>{item.muscleMass}kg</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => onSaveBulk(bulkPreview)} className="w-full bg-amber-500 text-white font-bold py-3 rounded-xl">Lưu tất cả {bulkPreview.length} hàng</button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="grid grid-cols-2 md:grid-cols-3 gap-4">
               {/* Inputs similar to previous version but cleaner */}
               <div className="col-span-full">
                <label className="text-xs font-bold text-slate-400">NGÀY KIỂM TRA</label>
                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2 bg-slate-50 rounded-lg border-none" />
               </div>
               {['weight', 'bodyFat', 'muscleMass', 'waterPercent', 'visceralFat', 'energy', 'boneMinerals', 'bioAge'].map(key => (
                 <div key={key}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">{key}</label>
                  <input 
                    type="number" step="0.1" 
                    value={(formData as any)[key]} 
                    onChange={e => setFormData({...formData, [key]: Number(e.target.value)})}
                    className="w-full p-2 bg-slate-50 rounded-lg border-none" 
                  />
                 </div>
               ))}
               <button type="submit" className="col-span-full mt-4 bg-emerald-600 text-white font-bold py-3 rounded-xl">Lưu chỉ số</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricForm;
