
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  
  // States cho cơ chế phản hồi AI chia nhỏ
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  const [latestMetric, setLatestMetric] = useState<HealthMetric | undefined>(undefined);
  const [showContacts, setShowContacts] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUid = (currentUser as any).id || (currentUser as any)._id;

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    if (window.innerWidth < 768) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Xử lý Hàng đợi tin nhắn (Message Stack)
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
      senderId: 'ai_coach', 
      senderName: '🍀Trợ lý Lucky', 
      senderRole: 'AI' as any, 
      content: textToDisplay, 
      timestamp: new Date().toISOString()
    };

    const updatedChat = { ...selectedChat, messages: [...selectedChat.messages, aiMessage] };
    await Database.saveChat(updatedChat);
    setSelectedChat(updatedChat);

    setPendingQueue(prev => prev.slice(1));
    setIsProcessingQueue(false);
    
    if (pendingQueue.length <= 1) {
      setIsTypingAI(false);
    }
  };

  const loadData = async () => {
    const uid = currentUid;
    const metrics = await Database.getMetrics(uid);
    if (metrics && metrics.length > 0) {
      const sorted = [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLatestMetric(sorted[0]);
    }

    const allChats = await Database.getChats() || [];
    let contacts: User[] = [];
    if (currentUser.role === UserRole.MEMBER) {
      contacts = users.filter(u => u.role === UserRole.COACH || u.role === UserRole.ADMIN);
    } else if (currentUser.role === UserRole.COACH) {
      contacts = users.filter(u => u.role === UserRole.MEMBER || u.role === UserRole.ADMIN);
    } else if (currentUser.role === UserRole.ADMIN) {
      contacts = users.filter(u => ((u as any).id || (u as any)._id) !== uid);
    }

    const activeChats = contacts.map(contact => {
      const contactId = (contact as any).id || (contact as any)._id;
      let chat = allChats.find(c => 
        (c.memberId === uid && c.coachId === contactId) || 
        (c.memberId === contactId && c.coachId === uid)
      );
      if (!chat) {
        chat = { id: `chat_${uid}_${contactId}`, memberId: uid, coachId: contactId, messages: [] };
      }
      return chat;
    });

    const aiChatId = `chat_ai_${uid}`;
    let aiChat = allChats.find(c => c.id === aiChatId);
    if (!aiChat) {
      aiChat = { id: aiChatId, memberId: uid, coachId: 'ai_coach', messages: [] };
    }
    
    const finalChats = [aiChat, ...activeChats];
    setChats(finalChats);
    
    if (selectedChat && !isProcessingQueue) {
      const updated = finalChats.find(c => c.id === selectedChat.id);
      if (updated && updated.messages.length > selectedChat.messages.length) {
         setSelectedChat(updated);
      }
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (!isTypingAI) loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser, users, selectedChat?.id, isTypingAI]);

  useEffect(() => {
    if (scrollRef.current && !showScrollButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat?.messages, isTypingAI, isProcessingQueue]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // Nếu khoảng cách tới đáy > 200px thì hiện nút
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 200;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  const handleSendMessage = async () => {
    // 1. Kiểm tra tính hợp lệ của nội dung gửi
    const trimmedText = inputText.trim();
    if ((!trimmedText && !selectedImage) || !selectedChat) return;

    // 2. Lưu lại giá trị hiện tại để xử lý và XÓA NGAY nội dung trên UI
    const sentText = trimmedText;
    const sentImage = selectedImage;
    setInputText('');
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const base64Data = sentImage ? sentImage.split(',')[1] : undefined;
    const isTargetAI = selectedChat.coachId === 'ai_coach';
    
    const newMessage: Message = {
      id: `msg_${Date.now()}`, 
      senderId: currentUid, 
      senderName: currentUser.fullName, 
      senderRole: currentUser.role,
      content: sentText || (sentImage ? "[Đã gửi một hình ảnh]" : ""), 
      imageUrl: sentImage || undefined,
      timestamp: new Date().toISOString()
    };

    let updatedMessages = [...selectedChat.messages, newMessage];
    
    // KIỂM TRA TỪ KHÓA TRONG CHAT 1-ON-1
    if (!isTargetAI) {
      const lowerText = sentText.toLowerCase();
      const matchedKnowledge = knowledge.find(k => lowerText.includes(k.keyword.toLowerCase()));
      
      if (matchedKnowledge) {
        const aiPrompt: Message = {
          id: `msg_prompt_${Date.now()}`,
          senderId: 'ai_coach',
          senderName: '🍀Trợ lý Lucky',
          senderRole: 'AI' as any,
          content: AI_PROMPT_TEXT,
          timestamp: new Date().toISOString()
        };
        updatedMessages.push(aiPrompt);
      }
    }

    const updatedChat = { ...selectedChat, messages: updatedMessages };
    setSelectedChat(updatedChat);
    await Database.saveChat(updatedChat);
    
    // Xử lý AI chat riêng tư
    if (isTargetAI) {
      setIsTypingAI(true);
      try {
        const aiResponse = await getAICoachResponse(
          updatedChat.messages, knowledge, rules, 
          sentText || "Phân tích hình ảnh này cho tôi",
          currentUser.healthGoal, latestMetric, base64Data
        );
        
        if (aiResponse) {
          const chunks = aiResponse.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 0);
          setPendingQueue(prev => [...prev, ...chunks]);
        }
      } catch (e) {
        setIsTypingAI(false);
        setPendingQueue(prev => [...prev, "Hệ thống AI đang quá tải, tôi sẽ phản hồi lại sau ít phút."]);
      }
    }
  };

  const handleAiChoice = async (chat: ChatSession, choice: 'tham khảo' | 'bỏ qua') => {
    const choiceMessage: Message = {
      id: `msg_choice_${Date.now()}`,
      senderId: currentUid,
      senderName: currentUser.fullName,
      senderRole: currentUser.role,
      content: `${currentUser.fullName} lựa chọn ${choice}.`,
      timestamp: new Date().toISOString()
    };

    let updatedMessages = [...chat.messages, choiceMessage];
    let updatedChat = { ...chat, messages: updatedMessages };
    
    setSelectedChat(updatedChat);
    await Database.saveChat(updatedChat);

    if (choice === 'tham khảo') {
      setIsTypingAI(true);
      // Tìm lại nội dung trước tin nhắn nhắc lựa chọn để AI tư vấn
      const lastUserMsg = [...chat.messages].reverse().find(m => 
        m.senderRole !== 'AI' && 
        !m.content.includes('lựa chọn') && 
        m.content.length > 2
      );
      
      const triggerText = lastUserMsg ? lastUserMsg.content : "Vui lòng cung cấp kiến thức liên quan.";

      try {
        const aiResponse = await getAICoachResponse(
          updatedMessages, knowledge, rules, 
          `Hội viên vừa chọn "Tham khảo" về chủ đề này: "${triggerText}". Hãy cung cấp thông tin khoa học liên quan.`,
          currentUser.healthGoal, latestMetric
        );
        
        if (aiResponse) {
          const chunks = aiResponse.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 0);
          setPendingQueue(prev => [...prev, ...chunks]);
        }
      } catch (e) {
        setIsTypingAI(false);
        setPendingQueue(prev => [...prev, "Tôi xin lỗi, có lỗi khi truy xuất dữ liệu kiến thức."]);
      }
    }
  };

  const getOtherUser = (chat: ChatSession) => {
    if (chat.coachId === 'ai_coach') return { fullName: '🍀Trợ lý Lucky', role: 'AI', id: 'ai_coach', avatar: null };
    const otherId = currentUid === chat.memberId ? chat.coachId : chat.memberId;
    return users.find(u => ((u as any).id || (u as any)._id) === otherId);
  };

  return (
    <div 
      className="fixed bottom-24 right-6 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 duration-300"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="p-5 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {!showContacts && (
            <button onClick={() => setShowContacts(true)} className="p-2 hover:bg-white/10 rounded-xl transition-all">←</button>
          )}
          
          {!showContacts && selectedChat && (
            <div className="w-10 h-10 rounded-xl bg-white/20 overflow-hidden flex items-center justify-center font-black text-sm shrink-0 border border-white/30">
              {getOtherUser(selectedChat)?.avatar ? (
                <img src={getOtherUser(selectedChat)!.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{getOtherUser(selectedChat)?.fullName.charAt(0)}</span>
              )}
            </div>
          )}

          <div>
            <div className="font-black text-xs uppercase tracking-widest">
              {showContacts ? 'Hỗ trợ trực tuyến' : getOtherUser(selectedChat!)?.fullName}
            </div>
            <div className="text-[10px] text-emerald-100 font-medium">
              {showContacts ? 'Lucky Hub Chat' : getOtherUser(selectedChat!)?.role}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl transition-all">×</button>
      </div>

      <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30 relative">
        {showContacts ? (
          <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar" style={{ overscrollBehavior: 'contain' }}>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">Hội thoại của bạn</div>
            {chats.map(chat => {
              const other = getOtherUser(chat);
              if (!other) return null;
              return (
                <div key={chat.id} onClick={() => { setSelectedChat(chat); setShowContacts(false); }} className="p-4 bg-white rounded-2xl cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all border border-slate-50 flex items-center gap-3 group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm overflow-hidden shrink-0 ${other.id === 'ai_coach' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {other.avatar ? (
                      <img src={other.avatar} alt={other.fullName} className="w-full h-full object-cover" />
                    ) : (
                      <span>{other.id === 'ai_coach' ? '🍀' : other.fullName.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-xs truncate group-hover:text-emerald-600 transition-colors">{other.fullName}</div>
                      <span className="text-[8px] font-black uppercase text-slate-400">{other.role}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : selectedChat ? (
          <>
            <div 
              ref={scrollRef} 
              onScroll={handleScroll}
              className="flex-grow p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-200" 
              style={{ overscrollBehavior: 'contain' }}
            >
              {selectedChat.messages.map((msg, idx) => {
                const isMyMessage = msg.senderId === currentUid;
                const isAiPrompt = msg.content === AI_PROMPT_TEXT;

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
                            onClick={() => handleAiChoice(selectedChat, 'tham khảo')}
                            className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                          >
                            Tham khảo
                          </button>
                          <button 
                            onClick={() => handleAiChoice(selectedChat, 'bỏ qua')}
                            className="flex-1 bg-white text-slate-400 border border-slate-200 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
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
                    <span className="text-[9px] font-black uppercase tracking-widest ml-1">🍀 Trợ lý đang soạn phản hồi...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Nút cuộn xuống tin nhắn mới nhất */}
            {showScrollButton && (
              <button 
                onClick={scrollToBottom}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white text-emerald-600 w-10 h-10 rounded-full shadow-xl flex items-center justify-center border border-emerald-100 hover:bg-emerald-50 transition-all animate-bounce z-10"
                title="Cuộn xuống tin nhắn mới nhất"
              >
                <span className="text-xl">↓</span>
              </button>
            )}

            <div className="p-4 bg-white border-t border-slate-50 shrink-0">
              {selectedImage && (
                <div className="relative w-16 h-16 mb-2">
                  <img src={selectedImage} alt="Preview" className="w-full h-full object-cover rounded-xl border-2 border-emerald-500" />
                  <button onClick={() => setSelectedImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px]">✕</button>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-slate-100">📸</button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                  const f = e.target.files?.[0];
                  if(f){ const r = new FileReader(); r.onload = () => setSelectedImage(r.result as string); r.readAsDataURL(f); }
                }} />
                <input 
                  placeholder="Gửi tin nhắn..." 
                  value={inputText} 
                  onChange={e => setInputText(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && (inputText.trim() || selectedImage)) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }} 
                  className="flex-grow px-4 bg-slate-50 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500 text-[12px] font-medium" 
                />
                <button 
                  onClick={handleSendMessage} 
                  disabled={!inputText.trim() && !selectedImage}
                  className={`bg-emerald-600 text-white w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg ${(!inputText.trim() && !selectedImage) ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:bg-emerald-700 shadow-emerald-100 active:scale-95'}`}
                >
                  🚀
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ChatSystem;
