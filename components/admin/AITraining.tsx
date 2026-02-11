
import React, { useState, memo } from 'react';
import { AIKnowledge, AIRule, Message, HealthGoal, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { getAICoachResponse } from '../../services/gemini.ts';

interface AITrainingProps {
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AITraining: React.FC<AITrainingProps> = ({ knowledge, rules, onRefresh }) => {
  const [testMessages, setTestMessages] = useState<Message[]>([]);
  const [testInput, setTestInput] = useState('');
  const [isTestTyping, setIsTestTyping] = useState(false);
  const [newK, setNewK] = useState({ keyword: '', content: '' });
  const [newRule, setNewRule] = useState('');

  const handleTestAI = async () => {
    if (!testInput.trim()) return;
    const userMsg: Message = { 
      id: Date.now().toString(), 
      senderId: 'tester', 
      senderName: 'Admin', 
      senderRole: UserRole.ADMIN, 
      content: testInput, 
      timestamp: new Date().toISOString() 
    };
    setTestMessages(prev => [...prev, userMsg]);
    setTestInput('');
    setIsTestTyping(true);
    const response = await getAICoachResponse([...testMessages, userMsg], knowledge, rules, userMsg.content, HealthGoal.BODY_RECOMP);
    setIsTestTyping(false);
    if (response) {
      setTestMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        senderId: 'ai', 
        senderName: '🍀Trợ lý Lucky', 
        senderRole: 'AI' as any, 
        content: response, 
        timestamp: new Date().toISOString() 
      }]);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('Xác nhận xóa kiến thức này?')) return;
    await Database.deleteKnowledge(id);
    onRefresh();
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Xác nhận xóa quy tắc này?')) return;
    await Database.deleteRule(id);
    onRefresh();
  };

  const handleAddKnowledge = async () => {
    if(!newK.keyword || !newK.content) return;
    await Database.addKnowledge(newK);
    setNewK({keyword: '', content: ''});
    onRefresh();
  };

  const handleAddRule = async () => {
    if(!newRule) return;
    await Database.addRule({content: newRule});
    setNewRule('');
    onRefresh();
  };

  return (
    <div className="space-y-10 animate-in fade-in">
      {/* Form Input Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
          <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
            <span className="text-lg">📚</span> Thêm Kiến thức (Knowledge)
          </h4>
          <div className="space-y-3">
            <input placeholder="Từ khóa (Ví dụ: Giảm cân, Nước...)" value={newK.keyword} onChange={e => setNewK({...newK, keyword: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 bg-white shadow-sm" />
            <textarea placeholder="Nội dung AI sẽ trả lời khi người dùng hỏi từ khóa này..." value={newK.content} onChange={e => setNewK({...newK, content: e.target.value})} className="w-full px-4 py-3 rounded-xl text-sm h-32 border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none bg-white shadow-sm" />
          </div>
          <button onClick={handleAddKnowledge} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Lưu kiến thức</button>
        </div>

        <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 space-y-4 shadow-sm">
          <h4 className="font-black text-blue-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
            <span className="text-lg">⚖️</span> Thêm Quy tắc (Rules)
          </h4>
          <div className="space-y-3">
            <textarea placeholder="Quy tắc huấn luyện (Ví dụ: Luôn chào hỏi thân thiện, Không tư vấn thuốc...)" value={newRule} onChange={e => setNewRule(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm h-[13.5rem] border-none outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-white shadow-sm" />
          </div>
          <button onClick={handleAddRule} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">Lưu quy tắc</button>
        </div>
      </div>

      {/* Cards Display Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Kiến thức ({knowledge.length})</h4>
          <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3 pr-2">
            {knowledge.map(k => (
              <div key={k.id || (k as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-emerald-200 transition-all">
                <div className="space-y-1">
                  <div className="font-black text-emerald-600 text-xs uppercase tracking-tight">{k.keyword}</div>
                  <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">{k.content}</div>
                </div>
                <button onClick={() => handleDeleteKnowledge(k.id || (k as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
              </div>
            ))}
            {knowledge.length === 0 && <div className="text-center py-10 text-slate-300 italic text-[11px] uppercase font-black">Chưa có kiến thức</div>}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Danh sách Quy tắc ({rules.length})</h4>
          <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3 pr-2">
            {rules.map((r, i) => (
              <div key={r.id || (r as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-blue-200 transition-all">
                <div className="space-y-1">
                  <div className="font-black text-blue-600 text-[9px] uppercase tracking-widest">Quy tắc #{i+1}</div>
                  <div className="text-[11px] text-slate-600 leading-relaxed font-medium">{r.content}</div>
                </div>
                <button onClick={() => handleDeleteRule(r.id || (r as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
              </div>
            ))}
            {rules.length === 0 && <div className="text-center py-10 text-slate-300 italic text-[11px] uppercase font-black">Chưa có quy tắc</div>}
          </div>
        </div>
      </div>

      {/* Terminal Section */}
      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Thử nghiệm phản hồi AI (Test Lab)</h4>
        <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[350px] flex flex-col border-4 border-slate-800 relative shadow-2xl">
          <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-2 no-scrollbar">
            <div className="text-emerald-500/50 italic mb-4"># Terminal v2.0 - Lucky AI Training Environment...</div>
            {testMessages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
                <span className="opacity-40 shrink-0">[{m.senderName}]:</span>
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
            {isTestTyping && <div className="animate-pulse text-emerald-600">_ AI đang suy nghĩ...</div>}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-800 pt-4">
            <span className="text-emerald-600 font-black">PROMPT&gt;</span>
            <input 
              placeholder="Nhập câu hỏi test AI..." 
              value={testInput} 
              onChange={e => setTestInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleTestAI()} 
              className="flex-grow bg-transparent border-none px-4 py-2 text-emerald-400 outline-none placeholder:text-emerald-900/50" 
            />
            <button onClick={handleTestAI} className="bg-emerald-800/30 hover:bg-emerald-800/50 text-emerald-400 px-4 py-1 rounded-lg transition-all border border-emerald-800/50 text-[10px] font-black uppercase tracking-widest">Gửi</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(AITraining);
