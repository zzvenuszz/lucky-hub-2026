
import React, { useRef, useEffect, memo } from 'react';
import { Message, ChatSession } from '../../types.ts';

interface ChatWindowProps {
  chat: ChatSession;
  currentUid: string;
  isTypingAI: boolean;
  onAiChoice: (chat: ChatSession, choice: 'tham khảo' | 'bỏ qua') => void;
  showScrollButton: boolean;
  scrollToBottom: () => void;
  onScroll: () => void;
  aiPromptText: string;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  chat, currentUid, isTypingAI, onAiChoice, 
  showScrollButton, scrollToBottom, onScroll, aiPromptText 
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && !showScrollButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages, isTypingAI, showScrollButton]);

  return (
    <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30 relative">
      <div 
        ref={scrollRef} 
        onScroll={onScroll}
        className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-200" 
        style={{ overscrollBehavior: 'contain' }}
      >
        {chat.messages.map((msg) => {
          const isMyMessage = msg.senderId === currentUid;
          const isAiPrompt = msg.content === aiPromptText;

          return (
            <div key={msg.id} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                isAiPrompt ? 'bg-emerald-50 border-2 border-emerald-500 text-slate-800 rounded-xl animate-bounce shadow-emerald-100' :
                msg.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100 text-slate-800 rounded-tl-none font-medium' : 
                isMyMessage ? 'bg-emerald-600 text-white rounded-tr-none' : 
                'bg-white text-slate-800 rounded-tl-none border border-slate-100'
              }`}>
                {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40 w-auto shadow-sm" alt="Attach" />}
                <div className="flex flex-col gap-1">
                  {!isMyMessage && <span className="text-[9px] font-black uppercase text-slate-400 mb-1">{msg.senderName}</span>}
                  {msg.content}
                </div>

                {isAiPrompt && (
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => onAiChoice(chat, 'tham khảo')}
                      className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md"
                    >
                      Tham khảo
                    </button>
                    <button 
                      onClick={() => onAiChoice(chat, 'bỏ qua')}
                      className="flex-1 bg-white text-slate-400 border border-slate-200 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                      Bỏ qua
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[8px] text-slate-400 mt-1 px-1 font-bold uppercase">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          );
        })}
        {isTypingAI && (
          <div className="flex flex-col items-start px-2">
            <div className="bg-amber-50 border border-amber-100 text-amber-600 p-2 rounded-xl rounded-tl-none flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
      </div>
      {showScrollButton && (
        <button onClick={scrollToBottom} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-emerald-600 w-10 h-10 rounded-full shadow-xl flex items-center justify-center border border-emerald-100 hover:bg-emerald-50 transition-all animate-bounce z-10">
          <span>↓</span>
        </button>
      )}
    </div>
  );
};

export default memo(ChatWindow);
