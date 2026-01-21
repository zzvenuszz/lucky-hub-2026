
import React, { useState, useEffect, useRef } from 'react';
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

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge, rules, onClose }) => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [latestMetric, setLatestMetric] = useState<HealthMetric | undefined>(undefined);
  const [showContacts, setShowContacts] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const uid = (currentUser as any).id || (currentUser as any)._id;
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
    
    const finalChats = [aiChat, ...activeChats].sort((a, b) => {
      if (a.coachId === 'ai_coach') return -1;
      if (b.coachId === 'ai_coach') return 1;
      const lastA = a.messages.length > 0 ? new Date(a.messages[a.messages.length-1].timestamp).getTime() : 0;
      const lastB = b.messages.length > 0 ? new Date(b.messages[b.messages.length-1].timestamp).getTime() : 0;
      return lastB - lastA;
    });

    setChats(finalChats);
    
    if (selectedChat) {
      const updated = finalChats.find(c => c.id === selectedChat.id);
      if (updated && JSON.stringify(updated.messages) !== JSON.stringify(selectedChat.messages)) {
        setSelectedChat(updated);
      }
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [currentUser, users, selectedChat?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedChat?.messages, isTypingAI]);

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || !selectedChat) return;
    const base64Data = selectedImage ? selectedImage.split(',')[1] : undefined;
    const currentImageUrl = selectedImage;
    const isTargetAI = selectedChat.coachId === 'ai_coach';
    
    const newMessage: Message = {
      id: `msg_${Date.now()}`, 
      senderId: (currentUser as any).id || (currentUser as any)._id, 
      senderName: currentUser.fullName, 
      senderRole: currentUser.role,
      content: inputText || (selectedImage ? "[Đã gửi một hình ảnh]" : ""), 
      imageUrl: currentImageUrl || undefined,
      timestamp: new Date().toISOString()
    };

    const updatedChat = { ...selectedChat, messages: [...selectedChat.messages, newMessage] };
    setSelectedChat(updatedChat);
    await Database.saveChat(updatedChat);
    
    const sentText = inputText;
    setInputText('');
    setSelectedImage(null);

    if (isTargetAI) {
      setIsTypingAI(true);
      try {
        const aiResponse = await getAICoachResponse(
          updatedChat.messages, knowledge, rules, 
          sentText || "Phân tích hình ảnh này cho tôi",
          currentUser.healthGoal, latestMetric, base64Data
        );
        if (aiResponse) {
          const aiMessage: Message = {
            id: `msg_ai_${Date.now()}`, senderId: 'ai_coach', senderName: 'Lucky AI', 
            senderRole: 'AI' as any, content: aiResponse, timestamp: new Date().toISOString()
          };
          const finalChat = { ...updatedChat, messages: [...updatedChat.messages, aiMessage] };
          await Database.saveChat(finalChat);
          setSelectedChat(finalChat);
        }
      } finally { setIsTypingAI(false); }
    }
  };

  const getOtherUser = (chat: ChatSession) => {
    if (chat.coachId === 'ai_coach') return { fullName: 'Lucky AI Advisor', role: 'AI', id: 'ai_coach' };
    const currentUid = (currentUser as any).id || (currentUser as any)._id;
    const otherId = currentUid === chat.memberId ? chat.coachId : chat.memberId;
    return users.find(u => ((u as any).id || (u as any)._id) === otherId);
  };

  return (
    <div className="fixed bottom-24 left-6 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 fade-in duration-300">
      {/* Header */}
      <div className="p-5 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {!showContacts && (
            <button onClick={() => setShowContacts(true)} className="p-2 hover:bg-white/10 rounded-xl transition-all">←</button>
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

      <div className="flex-grow flex flex-col min-h-0 bg-slate-50/30">
        {showContacts ? (
          <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">Hội thoại của bạn</div>
            {chats.map(chat => {
              const other = getOtherUser(chat);
              if (!other) return null;
              return (
                <div key={chat.id} onClick={() => { setSelectedChat(chat); setShowContacts(false); }} className="p-4 bg-white rounded-2xl cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all border border-slate-50 flex items-center gap-3 group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${other.id === 'ai_coach' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {other.id === 'ai_coach' ? 'AI' : other.fullName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <div className="font-bold text-xs truncate group-hover:text-emerald-600 transition-colors">{other.fullName}</div>
                      <span className="text-[8px] font-black uppercase text-slate-400">{other.role}</span>
                    </div>
                    <div className="text-[10px] truncate mt-0.5 text-slate-400">
                      {chat.messages.length > 0 ? chat.messages[chat.messages.length-1].content : 'Bắt đầu ngay...'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : selectedChat ? (
          <>
            <div ref={scrollRef} className="flex-grow p-4 overflow-y-auto space-y-4 no-scrollbar">
              {selectedChat.messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === ((currentUser as any).id || (currentUser as any)._id) ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                    msg.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100 text-slate-800 rounded-tl-none' : 
                    msg.senderId === ((currentUser as any).id || (currentUser as any)._id) ? 'bg-emerald-600 text-white rounded-tr-none' : 
                    'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    {msg.imageUrl && <img src={msg.imageUrl} className="rounded-xl mb-2 max-h-40 w-auto shadow-sm" alt="Attach" />}
                    {msg.content}
                  </div>
                  <span className="text-[8px] text-slate-400 mt-1 px-1 font-bold uppercase">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              ))}
              {isTypingAI && <div className="text-[10px] text-amber-500 animate-pulse font-black uppercase tracking-widest px-2">AI đang đọc dữ liệu cơ thể...</div>}
            </div>
            
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
                <input placeholder="Gửi tin nhắn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-grow px-4 bg-slate-50 rounded-xl border-none outline-none focus:ring-1 focus:ring-emerald-500 text-[12px] font-medium" />
                <button onClick={handleSendMessage} className="bg-emerald-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all">🚀</button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ChatSystem;
