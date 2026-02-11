
import React, { useState, memo } from 'react';
import { Message, AIKnowledge, AIRule, UserRole, HealthGoal } from '../../../types.ts';
import { getAICoachResponse } from '../../../services/gemini.ts';

interface AITestLabProps {
  knowledge: AIKnowledge[];
  rules: AIRule[];
}

const AITestLab: React.FC<AITestLabProps> = ({ knowledge, rules }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const handleTest = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { 
      id: Date.now().toString(), senderId: 'tester', senderName: 'Admin', 
      senderRole: UserRole.ADMIN, content: input, timestamp: new Date().toISOString() 
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    const response = await getAICoachResponse([...messages, userMsg], knowledge, rules, userMsg.content, HealthGoal.BODY_RECOMP);
    setIsTyping(false);
    if (response) {
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), senderId: 'ai', senderName: '🍀Trợ lý Lucky', 
        senderRole: 'AI' as any, content: response, timestamp: new Date().toISOString() 
      }]);
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Thử nghiệm phản hồi AI (Test Lab)</h4>
      <div className="bg-slate-900 rounded-[2.5rem] p-6 text-emerald-400 font-mono text-[11px] h-[350px] flex flex-col border-4 border-slate-800 shadow-2xl">
        <div className="flex-grow overflow-y-auto space-y-2 mb-4 pr-2 no-scrollbar">
          <div className="text-emerald-500/50 italic mb-4"># Terminal v2.0 - Lucky AI Environment...</div>
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.senderId === 'tester' ? 'text-emerald-200/50' : 'text-emerald-400'}`}>
              <span className="opacity-40 shrink-0">[{m.senderName}]:</span>
              <span className="whitespace-pre-wrap">{m.content}</span>
            </div>
          ))}
          {isTyping && <div className="animate-pulse text-emerald-600">_ AI đang suy nghĩ...</div>}
        </div>
        <div className="flex items-center gap-2 border-t border-slate-800 pt-4">
          <span className="text-emerald-600 font-black">PROMPT&gt;</span>
          <input 
            placeholder="Nhập câu hỏi test AI..." value={input} 
            onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTest()} 
            className="flex-grow bg-transparent border-none px-4 py-2 text-emerald-400 outline-none" 
          />
          <button onClick={handleTest} className="bg-emerald-800/30 text-emerald-400 px-4 py-1 rounded-lg border border-emerald-800/50 text-[10px] font-black uppercase">Gửi</button>
        </div>
      </div>
    </div>
  );
};

export default memo(AITestLab);
