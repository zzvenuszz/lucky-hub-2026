import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User, ChatSession, Message } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface CoachChatProps {
  currentUser: User;
  selectedMember: User;
  onClose: () => void;
}

const CoachChat: React.FC<CoachChatProps> = memo(({ currentUser, selectedMember, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const selectedMemberId = (selectedMember as any).id || (selectedMember as any)._id;
  const chatId = [currentUserId, selectedMemberId].sort().join('_');

  // Load chat session
  useEffect(() => {
    const loadChat = async () => {
      setIsLoading(true);
      try {
        console.log(`[CoachChat] Loading chat: ${chatId}`);
        const allChats = await Database.getChats();
        const chat = allChats.find((c: ChatSession) => c.id === chatId);
        if (chat) {
          setMessages(chat.messages || []);
          console.log(`[CoachChat] Loaded ${chat.messages.length} messages`);
        } else {
          setMessages([]);
        }
      } catch (error) {
        console.error('[CoachChat] Error loading chat:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadChat();
  }, [chatId]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isSending) return;
    setIsSending(true);

    try {
      const newMsg: Message = {
        id: Date.now().toString(),
        senderId: currentUserId,
        senderName: currentUser.fullName,
        senderRole: (currentUser as any).role || 'COACH',
        content: inputText.trim(),
        timestamp: new Date().toISOString()
      };

      const updatedMessages = [...messages, newMsg];
      const chatData: ChatSession = {
        id: chatId,
        memberId: selectedMemberId,
        coachId: currentUserId,
        messages: updatedMessages
      };

      await Database.saveChat(chatData);
      setMessages(updatedMessages);
      setInputText('');
      console.log(`[CoachChat] Message sent to ${selectedMember.fullName}`);
    } catch (error) {
      console.error('[CoachChat] Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, currentUserId, currentUser, messages, chatId, selectedMemberId, selectedMember.fullName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-slate-100">
            <img 
              src={selectedMember.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedMember.username}&backgroundColor=f8fafc`} 
              alt={selectedMember.fullName} 
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-black text-slate-700">{selectedMember.fullName}</p>
            <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider">Đang chat</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-all text-xl">
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400 font-bold text-xs text-center">
              Chưa có tin nhắn nào.<br />
              Hãy gửi lời chào đến {selectedMember.fullName}!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMyMessage = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isMyMessage
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-700 rounded-bl-md'
                }`}>
                  <p className="text-sm font-bold leading-relaxed">{msg.content}</p>
                  <p className={`text-[10px] font-bold mt-1 ${isMyMessage ? 'text-emerald-200' : 'text-slate-400'}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-50 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            disabled={isSending}
            className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-bold"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isSending}
            className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-sm font-black uppercase tracking-wider shadow-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? '⏳' : 'Gửi'}
          </button>
        </div>
      </div>
    </div>
  );
});

CoachChat.displayName = 'CoachChat';
export default CoachChat;