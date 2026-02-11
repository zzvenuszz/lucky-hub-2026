
import React, { useState, memo } from 'react';
import { AIRule } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface RuleManagerProps {
  rules: AIRule[];
  onRefresh: () => void;
}

const RuleManager: React.FC<RuleManagerProps> = ({ rules, onRefresh }) => {
  const [newRule, setNewRule] = useState('');

  const handleAdd = async () => {
    if(!newRule) return;
    await Database.addRule({content: newRule});
    setNewRule('');
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xác nhận xóa quy tắc này?')) return;
    await Database.deleteRule(id);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 space-y-4 shadow-sm">
        <h4 className="font-black text-blue-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
          <span className="text-lg">⚖️</span> Thêm Quy tắc (Rules)
        </h4>
        <div className="space-y-3">
          <textarea placeholder="Quy tắc huấn luyện..." value={newRule} onChange={e => setNewRule(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm h-[13.5rem] bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Lưu quy tắc</button>
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Quy tắc ({rules.length})</h4>
        <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3">
          {rules.map((r, i) => (
            <div key={r.id || (r as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-blue-200 transition-all">
              <div className="space-y-1">
                <div className="font-black text-blue-600 text-[9px] uppercase tracking-widest">Quy tắc #{i+1}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed font-medium">{r.content}</div>
              </div>
              <button onClick={() => handleDelete(r.id || (r as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(RuleManager);
