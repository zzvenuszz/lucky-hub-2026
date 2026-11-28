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
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    container.scrollTo({ 
      top: container.scrollHeight, 
      behavior: smooth && !prefersReducedMotion ? 'smooth' : 'instant' as any
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
  const previousMessagesRef = useRef({ chatId: chat.id, count: chat.messages.length });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Scroll xuống cuối khi lần đầu mở chat
  useEffect(() => {
    initialScrollDone.current = false;
    const container = scrollRef.current;
    if (!container) return;

    const timeoutId = setTimeout(() => {
      scrollToBottomDom(container);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setHasNewMessages(false);
      initialScrollDone.current = true;
      console.log(`[ChatWindow] Initial scroll to bottom for chat ${chat.id}`);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [chat.id]);

  useEffect(() => {
    const previous = previousMessagesRef.current;
    if (previous.chatId !== chat.id) {
      previousMessagesRef.current = { chatId: chat.id, count: chat.messages.length };
      setHasNewMessages(false);
      return;
    }
    if (chat.messages.length > previous.count) {
      const addedMessages = chat.messages.slice(previous.count);
      if (!isAtBottomRef.current && addedMessages.some(message => message.senderId !== currentUid)) {
        setHasNewMessages(true);
      }
    }
    previousMessagesRef.current = { chatId: chat.id, count: chat.messages.length };
  }, [chat.id, chat.messages, currentUid]);

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
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(previous => previous === atBottom ? previous : atBottom);
    if (atBottom) setHasNewMessages(false);
  }, []);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottomDom(scrollRef.current, true);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewMessages(false);
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
    <div className="flex min-h-0 flex-grow flex-col bg-slate-50/40">
      <div ref={scrollRef} onScroll={handleScroll} className="flex-grow space-y-4 overflow-y-auto overflow-x-hidden p-4" style={{ overscrollBehavior: 'contain' }}>
        {messageGroups.map((group, gi) => (
          <div key={gi}>
            <div className="mb-4 flex items-center justify-center">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                {group.date}
              </span>
            </div>

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

        {chat.messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="text-4xl">💬</div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Chưa có tin nhắn nào</p>
              <p className="text-[10px] text-slate-300">Hãy gửi lời chào đầu tiên nhé!</p>
            </div>
          </div>
        )}

        {isTypingAI && (
          <div className="flex flex-col items-start px-2">
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-amber-100 bg-amber-50 p-3 text-amber-600">
              <span className="text-[10px] font-black">🍀 Trợ lý Lucky</span>
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {!isAtBottom && hasNewMessages && chat.messages.length > 0 && (
        <button onClick={handleScrollToBottom} className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-100 bg-white px-4 py-2 text-xs font-black text-emerald-600 shadow-xl transition hover:bg-emerald-50">
          <span className="animate-bounce text-lg">↓</span>
          <span>Tin nhắn mới</span>
        </button>
      )}

      <MessageInput onSend={sendMessage} onTyping={sendTyping} />
    </div>
  );
});

ChatWindow.displayName = 'ChatWindow';

export default ChatWindow;
