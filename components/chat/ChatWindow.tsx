import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Message, ChatSession } from '../../types.ts';

interface ChatWindowProps {
  chat: ChatSession;
  currentUid: string;
  isTypingAI: boolean;
  onAiChoice: (chat: ChatSession, choice: 'tham khảo' | 'bỏ qua') => void;
  onAtBottomChange: (atBottom: boolean) => void;
  scrollToBottom: () => void;
  aiPromptText: string;
  promptChoice: {userName: string, choice: string} | null;
  newMessageCount: number;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ 
  chat, currentUid, isTypingAI, onAiChoice, 
  onAtBottomChange, scrollToBottom, aiPromptText, promptChoice,
  newMessageCount
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showNotification, setShowNotification] = useState(false);

  // Auto scroll xuống cuối khi messages thay đổi (nếu đang ở bottom)
  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages, isTypingAI]);

  // Khi lần đầu mở chat, scroll xuống cuối
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottomRef.current = true;
      onAtBottomChange(true);
    }
  }, [chat.id]);

  // Hiển thị notification khi có newMessageCount > 0
  useEffect(() => {
    if (newMessageCount > 0) {
      setShowNotification(true);
    } else {
      // Delay một chút để tránh flicker khi reset
      const timer = setTimeout(() => setShowNotification(false), 300);
      return () => clearTimeout(timer);
    }
  }, [newMessageCount]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
    isAtBottomRef.current = atBottom;
    onAtBottomChange(atBottom);
  }, [onAtBottomChange]);

  const handleScrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    isAtBottomRef.current = true;
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30 relative">
      <div 
        ref={scrollRef} 
        onScroll={handleScroll}
        className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-200" 
        style={{ overscrollBehavior: 'contain' }}
      >
        {chat.messages.map((msg) => {
          const isMyMessage = msg.senderId === currentUid;
          const isAiPrompt = msg.content === aiPromptText;

          return (
            <div key={msg.id} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                isAiPrompt ? 'bg-emerald-50/50 border border-emerald-200 text-slate-700 rounded-2xl' :
                msg.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100 text-slate-800 rounded-tl-none font-medium' : 
                isMyMessage ? 'bg-emerald-600 text-white rounded-tr-none' : 
                'bg-white text-slate-800 rounded-tl-none border border-slate-100'
              }`}>
                {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40 w-auto shadow-sm" alt="Attach" />}
                <div className="flex flex-col gap-1">
                  {!isMyMessage && <span className="text-[9px] font-black uppercase text-slate-400 mb-1">{msg.senderName}</span>}
                  {msg.content}
                </div>

                {isAiPrompt && !promptChoice && (
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

                {isAiPrompt && promptChoice && (
                  <div className="mt-3 pt-3 border-t border-emerald-200 text-[11px] text-slate-500 italic">
                    👤 {promptChoice.userName} đã chọn {promptChoice.choice === 'tham khảo' ? 'tham khảo thông tin' : 'bỏ qua'}
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

      {/* Notification: có tin nhắn mới khi đang scroll lên */}
      {showNotification && (
        <button 
          onClick={handleScrollToBottom} 
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white text-emerald-600 px-4 py-2 rounded-full shadow-xl border border-emerald-100 hover:bg-emerald-50 transition-all z-10 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-lg font-bold animate-bounce">↓</span>
          <span className="font-bold text-xs">{newMessageCount > 0 ? `Có ${newMessageCount} tin nhắn mới` : 'Xuống cuối'}</span>
        </button>
      )}
    </div>
  );
};

ChatWindow.displayName = 'ChatWindow';

export default memo(ChatWindow);