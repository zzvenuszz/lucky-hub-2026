
import React, { useState, memo } from 'react';
import { AIKnowledge } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface KnowledgeManagerProps {
  knowledge: AIKnowledge[];
  onRefresh: () => void;
}

const KnowledgeManager: React.FC<KnowledgeManagerProps> = ({ knowledge, onRefresh }) => {
  const [newK, setNewK] = useState({ keyword: '', content: '' });

  const handleAdd = async () => {
    if(!newK.keyword || !newK.content) return;
    await Database.addKnowledge(newK);
    setNewK({keyword: '', content: ''});
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xác nhận xóa kiến thức này?')) return;
    await Database.deleteKnowledge(id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
        <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
          <span className="text-lg">📚</span> Thêm Kiến thức (Knowledge)
        </h4>
        <div className="space-y-3">
          <input placeholder="Từ khóa..." value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500" />
          <textarea placeholder="Nội dung AI trả lời..." value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm h-32 bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Lưu kiến thức</button>
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Kiến thức ({knowledge.length})</h4>
        <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3">
          {knowledge.map(k => (
            <div key={k.id || (k as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-emerald-200 transition-all">
              <div className="space-y-1">
                <div className="font-black text-emerald-600 text-xs uppercase tracking-tight">{k.keyword}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">{k.content}</div>
              </div>
              <button onClick={() => handleDelete(k.id || (k as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(KnowledgeManager);
