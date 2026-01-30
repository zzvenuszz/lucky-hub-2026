
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, UserRole, Message, ChatSession, AIKnowledge, AIRule, HealthMetric } from '../types.ts';
import { getAICoachResponse } from '../services/gemini.ts';
import { Database } from '../services/database.ts';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onClose: () => void;
}

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge, rules, onClose }) => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [latestMetric, setLatestMetric] = useState<HealthMetric | undefined>(undefined);
  const [showContacts, setShowContacts] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // PHÂN TÍCH: Sử dụng kiểu 'any' cho socketRef để tránh lỗi TypeScript không nhận diện phương thức 'on' từ thư viện socket.io-client.
  const socketRef = useRef<any>(null);

  const currentUid = (currentUser as any).id || (currentUser as any)._id;

  // Khởi tạo Socket
  useEffect(() => {
    socketRef.current = io();

    // CÁCH GIẢI QUYẾT: Kiểm tra sự tồn tại của socketRef.current trước khi sử dụng các phương thức emit/on.
    // BÁO CÁO KẾT QUẢ: Đã khắc phục lỗi compile tại dòng 42 và 46.
    if (socketRef.current) {
      socketRef.current.emit('register_online', currentUid);

      socketRef.current.on('online_status_change', (uids: string[]) => {
        setOnlineUserIds(uids);
      });

      socketRef.current.on('receive_message', (data: { chatId: string, message: Message }) => {
        if (selectedChat && data.chatId === selectedChat.id) {
          setSelectedChat(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : null);
        } else {
          // Cập nhật preview trong danh sách chat
          setChats(prev => prev.map(c => c.id === data.chatId ? { ...c, messages: [...c.messages, data.message] } : c));
        }
      });
    }

    return () => {
      socketRef.current?.disconnect();
    };
  }, [currentUid, selectedChat?.id]);

  useEffect(() => {
    if (pendingQueue.length > 0 && !isProcessingQueue && selectedChat) {
      processNextInQueue();
    }
  }, [pendingQueue, isProcessingQueue, selectedChat?.id]);

  const processNextInQueue = async () => {
    if (pendingQueue.length === 0 || !selectedChat) return;
    setIsProcessingQueue(true);
    const textToDisplay = pendingQueue[0];
    const delay = Math.min(Math.max(textToDisplay.length * 20, 800), 2500);
    await new Promise(resolve => setTimeout(resolve, delay));

    const aiMessage: Message = {
      id: `msg_ai_${Date.now()}_${Math.random()}`, 
      senderId: 'ai_coach', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, 
      content: textToDisplay, timestamp: new Date().toISOString()
    };

    const updatedChat = { ...selectedChat, messages: [...selectedChat.messages, aiMessage] };
    setSelectedChat(updatedChat);
    
    // BÁO CÁO KẾT QUẢ: Sử dụng socketRef.current (any) giúp code linh hoạt và không bị lỗi compile.
    socketRef.current?.emit('send_message', { chatId: selectedChat.id, message: aiMessage });

    setPendingQueue(prev => prev.slice(1));
    setIsProcessingQueue(false);
    if (pendingQueue.length <= 1) setIsTypingAI(false);
  };

  const loadData = async () => {
    const metrics = await Database.getMetrics(currentUid);
    if (metrics?.length > 0) {
      const sorted = [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLatestMetric(sorted[0]);
    }

    const allChats = await Database.getChats() || [];
    let contacts = currentUser.role === UserRole.MEMBER ? users.filter(u => u.role !== UserRole.MEMBER) : users.filter(u => ((u as any).id || (u as any)._id) !== currentUid);

    const activeChats = contacts.map(contact => {
      const contactId = (contact as any).id || (contact as any)._id;
      let chat = allChats.find(c => (c.memberId === currentUid && c.coachId === contactId) || (c.memberId === contactId && c.coachId === currentUid));
      return chat || { id: `chat_${currentUid}_${contactId}`, memberId: currentUid, coachId: contactId, messages: [] };
    });

    const aiChatId = `chat_ai_${currentUid}`;
    const aiChat = allChats.find(c => c.id === aiChatId) || { id: aiChatId, memberId: currentUid, coachId: 'ai_coach', messages: [] };
    setChats([aiChat, ...activeChats]);
  };

  useEffect(() => { loadData(); }, [currentUser, users]);

  useEffect(() => {
    if (scrollRef.current && !showScrollButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat?.messages, isTypingAI]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    const trimmedText = inputText.trim();
    if ((!trimmedText && !selectedImage) || !selectedChat) return;
    const sentText = trimmedText; const sentImage = selectedImage;
    setInputText(''); setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const isTargetAI = selectedChat.coachId === 'ai_coach';
    const newMessage: Message = {
      id: `msg_${Date.now()}`, senderId: currentUid, senderName: currentUser.fullName, senderRole: currentUser.role,
      content: sentText || (sentImage ? "[Đã gửi một hình ảnh]" : ""), imageUrl: sentImage || undefined, timestamp: new Date().toISOString()
    };

    let updatedMessages = [...selectedChat.messages, newMessage];
    
    // Logic gợi ý AI trong chat người-người
    if (!isTargetAI) {
      const matchedKnowledge = knowledge.find(k => sentText.toLowerCase().includes(k.keyword.toLowerCase()));
      if (matchedKnowledge) {
        updatedMessages.push({
          id: `msg_prompt_${Date.now()}`, senderId: 'ai_coach', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, 
          content: AI_PROMPT_TEXT, timestamp: new Date().toISOString()
        });
      }
    }

    const updatedChat = { ...selectedChat, messages: updatedMessages };
    setSelectedChat(updatedChat);
    socketRef.current?.emit('send_message', { chatId: selectedChat.id, message: newMessage });
    
    if (isTargetAI) {
      setIsTypingAI(true);
      try {
        const aiResponse = await getAICoachResponse(updatedChat.messages, knowledge, rules, sentText || "Phân tích hình ảnh", currentUser.healthGoal, latestMetric, sentImage?.split(',')[1]);
        if (aiResponse) setPendingQueue(prev => [...prev, ...aiResponse.split(/\n\n+/).map(c => c.trim())]);
      } catch { setIsTypingAI(false); setPendingQueue(prev => [...prev, "AI đang bận..."]); }
    }
  };

  const handleAiChoice = async (chat: ChatSession, choice: 'tham khảo' | 'bỏ qua') => {
    const choiceMessage: Message = {
      id: `msg_choice_${Date.now()}`, senderId: currentUid, senderName: currentUser.fullName, senderRole: currentUser.role,
      content: `${currentUser.fullName} lựa chọn ${choice}.`, timestamp: new Date().toISOString()
    };
    const updatedChat = { ...chat, messages: [...chat.messages, choiceMessage] };
    setSelectedChat(updatedChat);
    socketRef.current?.emit('send_message', { chatId: chat.id, message: choiceMessage });

    if (choice === 'tham khảo') {
      setIsTypingAI(true);
      const lastUserMsg = [...chat.messages].reverse().find(m => m.senderRole !== 'AI' && !m.content.includes('lựa chọn'));
      try {
        const aiResponse = await getAICoachResponse(updatedChat.messages, knowledge, rules, `Hội viên vừa chọn "Tham khảo" về: "${lastUserMsg?.content || 'kiến thức'}"`, currentUser.healthGoal, latestMetric);
        if (aiResponse) setPendingQueue(prev => [...prev, ...aiResponse.split(/\n\n+/).map(c => c.trim())]);
      } catch { setIsTypingAI(false); }
    }
  };

  const getOtherUser = (chat: ChatSession) => {
    if (chat.coachId === 'ai_coach') return { fullName: '🍀Trợ lý Lucky', role: 'AI', id: 'ai_coach', avatar: null, isOnline: true };
    const otherId = currentUid === chat.memberId ? chat.coachId : chat.memberId;
    const u = users.find(u => ((u as any).id || (u as any)._id) === otherId);
    return { ...u, isOnline: onlineUserIds.includes(String(otherId)) };
  };

  return (
    <div className="fixed bottom-24 right-6 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 duration-300">
      <div className="p-5 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {!showContacts && <button onClick={() => setShowContacts(true)} className="p-2 hover:bg-white/10 rounded-xl transition-all">←</button>}
          {!showContacts && selectedChat && (
            <div className="relative w-10 h-10 rounded-xl bg-white/20 overflow-hidden flex items-center justify-center font-black text-sm shrink-0 border border-white/30">
              {getOtherUser(selectedChat)?.avatar ? <img src={getOtherUser(selectedChat)!.avatar} className="w-full h-full object-cover" /> : <span>{getOtherUser(selectedChat)?.fullName.charAt(0)}</span>}
              {getOtherUser(selectedChat)?.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-emerald-600 rounded-full"></div>}
            </div>
          )}
          <div>
            <div className="font-black text-xs uppercase tracking-widest">{showContacts ? 'Hỗ trợ trực tuyến' : getOtherUser(selectedChat!)?.fullName}</div>
            <div className="text-[10px] text-emerald-100 font-medium">{showContacts ? 'Lucky Hub Chat' : getOtherUser(selectedChat!)?.role}</div>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl">×</button>
      </div>

      <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30 relative">
        {showContacts ? (
          <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar">
            {chats.map(chat => {
              const other = getOtherUser(chat);
              if (!other) return null;
              return (
                <div key={chat.id} onClick={() => { setSelectedChat(chat); setShowContacts(false); }} className="p-4 bg-white rounded-2xl cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all border border-slate-50 flex items-center gap-3 group">
                  <div className="relative w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm overflow-hidden shrink-0 bg-slate-100">
                    {other.avatar ? <img src={other.avatar} className="w-full h-full object-cover" /> : <span>{other.id === 'ai_coach' ? '🍀' : other.fullName.charAt(0)}</span>}
                    {other.isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full"></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-xs truncate group-hover:text-emerald-600">{other.fullName}</div>
                      <span className="text-[8px] font-black uppercase text-slate-400">{other.role}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : selectedChat ? (
          <>
            <div ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; setShowScrollButton(el.scrollHeight - el.scrollTop - el.clientHeight > 200); }} className="flex-grow p-4 overflow-y-auto space-y-4 no-scrollbar">
              {selectedChat.messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUid ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed shadow-sm ${msg.content === AI_PROMPT_TEXT ? 'bg-emerald-50 border-2 border-emerald-500 animate-bounce' : msg.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100' : msg.senderId === currentUid ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-100'}`}>
                    {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40" />}
                    <div className="flex flex-col gap-1">{msg.content}</div>
                    {msg.content === AI_PROMPT_TEXT && (
                      <div className="mt-4 flex gap-2">
                        <button onClick={() => handleAiChoice(selectedChat, 'tham khảo')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[10px] uppercase">Tham khảo</button>
                        <button onClick={() => handleAiChoice(selectedChat, 'bỏ qua')} className="flex-1 bg-white text-slate-400 border py-2 rounded-lg font-black text-[10px] uppercase">Bỏ qua</button>
                      </div>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-400 mt-1 uppercase">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                </div>
              ))}
              {isTypingAI && <div className="flex items-center gap-2 p-2 bg-amber-50 text-amber-600 rounded-xl text-[9px] font-black uppercase">🍀 Đang soạn phản hồi...</div>}
            </div>
            {showScrollButton && <button onClick={scrollToBottom} className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white text-emerald-600 w-10 h-10 rounded-full shadow-xl border border-emerald-100 flex items-center justify-center animate-bounce">↓</button>}
            <div className="p-4 bg-white border-t border-slate-50">
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center border hover:text-emerald-600">📸</button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onload = () => setSelectedImage(r.result as string); r.readAsDataURL(f); } }} />
                <input placeholder="Gửi tin nhắn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-grow px-4 bg-slate-50 rounded-xl outline-none text-[12px] font-medium" />
                <button onClick={handleSendMessage} className="bg-emerald-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-lg">🚀</button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ChatSystem;
