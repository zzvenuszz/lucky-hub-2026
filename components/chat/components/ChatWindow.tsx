/**
 * ChatWindow - Component hiển thị messages với infinite scroll, date grouping, typing indicator
 */
import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { ChatSession, Message } from '../../../types.ts';
import { useChat } from '../ChatProvider.tsx';
import MessageBubble from './MessageBubble.tsx';
import MessageInput from './MessageInput.tsx';

interface ChatWindowProps {
  chat: ChatSession;
  currentUid: string;
}

function scrollToBottomDom(container: HTMLDivElement | null, smooth = false) {
  if (!container) return;
  requestAnimationFrame(() => {
    container.scrollTo({ 
      top: container.scrollHeight, 
      behavior: smooth ? 'smooth' : 'instant' as any 
    });
  });
}

/** Group messages by date */
function getDateLabel(timestamp: string): string {
  const msgDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const d = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (d(msgDate) === d(today)) return 'Hôm nay';
  if (d(msgDate) === d(yesterday)) return 'Hôm qua';
  
  return msgDate.toLocaleDateString('vi-VN', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

const ChatWindow: React.FC<ChatWindowProps> = memo(({ chat, currentUid }) => {
  const { 
    isTypingAI, sendMessage, sendTyping, sendReaction, 
    editMessage, deleteMessage, handleAiChoice, aiPromptText 
  } = useChat();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const initialScrollDone = useRef(false);
  const prevDateGroups = useRef<string[]>([]);

  // Scroll xuống cuối khi lần đầu mở chat
  useEffect(() => {
    initialScrollDone.current = false;
    const container = scrollRef.current;
    if (!container) return;

    const timeoutId = setTimeout(() => {
      scrollToBottomDom(container);
      isAtBottomRef.current = true;
      initialScrollDone.current = true;
      console.log(`[ChatWindow] Initial scroll to bottom for chat ${chat.id}`);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [chat.id]);

  // Auto scroll khi có message mới (nếu đang ở bottom)
  useEffect(() => {
    if (!scrollRef.current || !initialScrollDone.current) return;
    if (isAtBottomRef.current) {
      scrollToBottomDom(scrollRef.current, true);
    }
  }, [chat.messages, isTypingAI]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isAtBottomRef.current = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
  }, []);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottomDom(scrollRef.current, true);
    isAtBottomRef.current = true;
  }, []);

  // Group messages by date
  const messageGroups: { date: string; messages: Message[] }[] = [];
  chat.messages.forEach(msg => {
    const label = getDateLabel(msg.timestamp);
    const lastGroup = messageGroups[messageGroups.length - 1];
    if (lastGroup && lastGroup.date === label) {
      lastGroup.messages.push(msg);
    } else {
      messageGroups.push({ date: label, messages: [msg] });
    }
  });

  const AI_PROMPT_TEXT = aiPromptText || "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

  return (
    <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30">
      {/* Messages area */}
      <div 
        ref={scrollRef} 
        onScroll={handleScroll}
        className="flex-grow p-4 overflow-y-auto overflow-x-hidden space-y-4 scrollbar-thin scrollbar-thumb-slate-200" 
        style={{ overscrollBehavior: 'contain' }}
      >
        {messageGroups.map((group, gi) => (
          <div key={gi}>
            {/* Date separator */}
            <div className="flex items-center justify-center mb-4">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                {group.date}
              </span>
            </div>

            {/* Messages */}
            {group.messages.map((msg) => {
              const isMyMessage = msg.senderId === currentUid;
              const isAiPrompt = msg.content === AI_PROMPT_TEXT;

              return (
                <div key={msg.id} className="mb-2">
                  <MessageBubble
                    message={msg}
                    isMyMessage={isMyMessage}
                    isAiPrompt={isAiPrompt}
                    aiPromptText={AI_PROMPT_TEXT}
                    chat={chat}
                    onAiChoice={handleAiChoice}
                    onReaction={sendReaction}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Empty state */}
        {chat.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-4xl">💬</div>
              <p className="text-xs font-bold text-slate-400">Chưa có tin nhắn nào</p>
              <p className="text-[10px] text-slate-300">Hãy gửi lời chào đầu tiên nhé!</p>
            </div>
          </div>
        )}

        {/* AI Typing indicator */}
        {isTypingAI && (
          <div className="flex flex-col items-start px-2">
            <div className="bg-amber-50 border border-amber-100 text-amber-600 p-3 rounded-xl rounded-tl-none flex items-center gap-2">
              <span className="text-[10px] font-bold">🍀Trợ lý Lucky</span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottomRef.current && chat.messages.length > 0 && (
        <button 
          onClick={handleScrollToBottom} 
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-white text-emerald-600 px-4 py-2 rounded-full shadow-xl border border-emerald-100 hover:bg-emerald-50 transition-all z-10 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-lg font-bold animate-bounce">↓</span>
          <span className="font-bold text-xs">Tin nhắn mới</span>
        </button>
      )}

      {/* Input */}
      <MessageInput onSend={sendMessage} onTyping={sendTyping} />
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';

export default ChatWindow;