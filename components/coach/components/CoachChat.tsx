import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User, ChatSession, Message, AIKnowledge, AIRule, HealthGoal } from '../../../types.ts';
import { getAICoachResponse } from '../../../services/gemini.ts';
import { Database } from '../../../services/database.ts';

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

interface CoachChatProps {
  currentUser: User;
  selectedMember: User;
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onClose: () => void;
}

const CoachChat: React.FC<CoachChatProps> = memo(({ currentUser, selectedMember, knowledge, rules, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
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
      let finalMessages = updatedMessages;

      // Kiểm tra keyword AI
      if (knowledge.some(k => inputText.toLowerCase().includes(k.keyword.toLowerCase()))) {
        console.log(`[CoachChat] AI trigger detected: keyword match in message to ${selectedMember.fullName}`);
        const promptMsg: Message = {
          id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          senderId: 'ai_coach',
          senderName: '🍀Trợ lý Lucky',
          senderRole: 'AI' as any,
          content: AI_PROMPT_TEXT,
          timestamp: new Date().toISOString()
        };
        finalMessages = [...updatedMessages, promptMsg];
      }

      const chatData: ChatSession = {
        id: chatId,
        memberId: selectedMemberId,
        coachId: currentUserId,
        messages: finalMessages
      };

      await Database.saveChat(chatData);
      setMessages(finalMessages);
      setInputText('');
      console.log(`[CoachChat] Message sent to ${selectedMember.fullName}`);
    } catch (error) {
      console.error('[CoachChat] Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, currentUserId, currentUser, messages, chatId, selectedMemberId, selectedMember.fullName]);

  // Xử lý AI queue
  useEffect(() => {
    if (pendingQueue.length > 0 && !isProcessingQueue) {
      processNextInQueue();
    }
  }, [pendingQueue, isProcessingQueue]);

  const processNextInQueue = async () => {
    if (pendingQueue.length === 0) return;
    setIsProcessingQueue(true);
    const textToDisplay = pendingQueue[0];
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(textToDisplay.length * 20, 800), 2500)));
    const aiMsg: Message = { id: `ai_${Date.now()}`, senderId: 'ai_coach', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, content: textToDisplay, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, aiMsg];
    const chatData: ChatSession = { id: chatId, memberId: selectedMemberId, coachId: currentUserId, messages: updatedMessages };
    await Database.saveChat(chatData);
    setMessages(updatedMessages);
    setPendingQueue(prev => prev.slice(1));
    setIsProcessingQueue(false);
    if (pendingQueue.length <= 1) setIsTypingAI(false);
  };

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
            const isAiPrompt = msg.content === AI_PROMPT_TEXT;
            const isChoiceNotification = msg.content.startsWith('👤') && (msg.content.includes('đã chọn') || msg.content.includes('bỏ qua'));
            const isAiResponse = msg.senderRole === 'AI';
            return (
              <div key={msg.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} ${isChoiceNotification ? 'opacity-75' : ''}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isChoiceNotification ? 'bg-slate-50 border border-slate-200 text-slate-500 italic text-[11px]' :
                  isAiPrompt ? 'bg-emerald-50 border-2 border-emerald-500 text-slate-800 rounded-xl animate-bounce shadow-emerald-100' :
                  isAiResponse ? 'bg-amber-50 border border-amber-100 text-slate-800 font-medium' :
                  isMyMessage
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-700 rounded-bl-md'
                }`}>
                  {!isMyMessage && !isChoiceNotification && !isAiPrompt && !isAiResponse && (
                    <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{selectedMember.fullName}</p>
                  )}
                  {isAiPrompt && <p className="text-[9px] font-black uppercase text-amber-600 mb-1">🍀Trợ lý Lucky</p>}
                  {isAiResponse && <p className="text-[9px] font-black uppercase text-amber-600 mb-1">🍀Trợ lý Lucky</p>}
                  <p className="text-sm font-bold leading-relaxed">{msg.content}</p>
                  {!isChoiceNotification && !isAiPrompt && !isAiResponse && (
                    <p className={`text-[10px] font-bold mt-1 ${isMyMessage ? 'text-emerald-200' : 'text-slate-400'}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  )}
                </div>
                {isAiPrompt && (
                  <div className="mt-2 flex gap-2">
                    <button 
                      onClick={async () => {
                        const choiceText = 'đã chọn tham khảo thông tin từ Trợ lý Lucky 🌿';
                        const choiceMsg: Message = { id: `c_${Date.now()}`, senderId: currentUserId, senderName: currentUser.fullName, senderRole: currentUser.role as any, content: `👤 ${currentUser.fullName} ${choiceText}`, timestamp: new Date().toISOString() };
                        const updated = [...messages, choiceMsg];
                        const chatData: ChatSession = { id: chatId, memberId: selectedMemberId, coachId: currentUserId, messages: updated };
                        await Database.saveChat(chatData);
                        setMessages(updated);
                        setIsTypingAI(true);
                        const userGoal = selectedMember.healthGoals?.[0] || HealthGoal.OTHER;
                        const res = await getAICoachResponse(updated, knowledge, rules, "Cung cấp thông tin khoa học liên quan", userGoal);
                        if (res) setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter(c => c.trim())]); else setIsTypingAI(false);
                      }}
                      className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md"
                    >
                      Tham khảo
                    </button>
                    <button 
                      onClick={async () => {
                        const choiceText = 'đã bỏ qua thông tin từ Trợ lý Lucky.';
                        const choiceMsg: Message = { id: `c_${Date.now()}`, senderId: currentUserId, senderName: currentUser.fullName, senderRole: currentUser.role as any, content: `👤 ${currentUser.fullName} ${choiceText}`, timestamp: new Date().toISOString() };
                        const updated = [...messages, choiceMsg];
                        const chatData: ChatSession = { id: chatId, memberId: selectedMemberId, coachId: currentUserId, messages: updated };
                        await Database.saveChat(chatData);
                        setMessages(updated);
                      }}
                      className="flex-1 bg-white text-slate-400 border border-slate-200 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                    >
                      Bỏ qua
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        {isTypingAI && (
          <div className="flex justify-start">
            <div className="bg-amber-50 border border-amber-100 text-amber-600 p-2 rounded-xl rounded-tl-none flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
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