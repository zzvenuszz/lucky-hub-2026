
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, UserRole, Message, ChatSession, AIKnowledge, AIRule, HealthMetric } from '../types.ts';
import { getAICoachResponse } from '../services/gemini.ts';
import { Database } from '../services/database.ts';
import ContactList from './chat/ContactList.tsx';
import ChatWindow from './chat/ChatWindow.tsx';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onClose: () => void;
}

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge, rules, onClose }) => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [latestMetric, setLatestMetric] = useState<HealthMetric | undefined>(undefined);
  const [showContacts, setShowContacts] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUid = (currentUser as any).id || (currentUser as any)._id;

  useEffect(() => {
    if (pendingQueue.length > 0 && !isProcessingQueue && selectedChat) {
      processNextInQueue();
    }
  }, [pendingQueue, isProcessingQueue, selectedChat?.id]);

  const processNextInQueue = async () => {
    if (pendingQueue.length === 0 || !selectedChat) return;
    setIsProcessingQueue(true);
    const textToDisplay = pendingQueue[0];
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(textToDisplay.length * 20, 800), 2500)));
    const aiMsg: Message = { id: `ai_${Date.now()}`, senderId: 'ai_coach', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, content: textToDisplay, timestamp: new Date().toISOString() };
    const updated = { ...selectedChat, messages: [...selectedChat.messages, aiMsg] };
    await Database.saveChat(updated);
    setSelectedChat(updated);
    setPendingQueue(prev => prev.slice(1));
    setIsProcessingQueue(false);
    if (pendingQueue.length <= 1) setIsTypingAI(false);
  };

  const loadData = useCallback(async () => {
    const metrics = await Database.getMetrics(currentUid);
    if (metrics?.length) setLatestMetric([...metrics].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]);
    const allChats = await Database.getChats() || [];
    let contacts = users.filter(u => ((u as any).id || (u as any)._id) !== currentUid);
    const activeChats = contacts.map(contact => {
      const cId = (contact as any).id || (contact as any)._id;
      return allChats.find(c => (c.memberId === currentUid && c.coachId === cId) || (c.memberId === cId && c.coachId === currentUid)) 
             || { id: `chat_${currentUid}_${cId}`, memberId: currentUid, coachId: cId, messages: [] };
    });
    const aiChatId = `chat_ai_${currentUid}`;
    const aiChat = allChats.find(c => c.id === aiChatId) || { id: aiChatId, memberId: currentUid, coachId: 'ai_coach', messages: [] };
    setChats([aiChat, ...activeChats]);
  }, [currentUid, users]);

  useEffect(() => { loadData(); const interval = setInterval(() => { if (!isTypingAI) loadData(); }, 5000); return () => clearInterval(interval); }, [loadData, isTypingAI]);

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || !selectedChat) return;
    setIsProcessingImage(true);
    const sentText = inputText; const sentImg = selectedImage ? await compressImage(selectedImage) : null;
    setInputText(''); setSelectedImage(null);
    const msg: Message = { id: `m_${Date.now()}`, senderId: currentUid, senderName: currentUser.fullName, senderRole: currentUser.role, content: sentText || "[Hình ảnh]", imageUrl: sentImg || undefined, timestamp: new Date().toISOString() };
    let updatedMsgs = [...selectedChat.messages, msg];
    if (selectedChat.coachId !== 'ai_coach' && knowledge.some(k => sentText.toLowerCase().includes(k.keyword.toLowerCase()))) {
      updatedMsgs.push({ id: `p_${Date.now()}`, senderId: 'ai_coach', senderName: '🍀Trợ lý Lucky', senderRole: 'AI' as any, content: AI_PROMPT_TEXT, timestamp: new Date().toISOString() });
    }
    const updatedChat = { ...selectedChat, messages: updatedMsgs };
    setSelectedChat(updatedChat); await Database.saveChat(updatedChat);
    if (selectedChat.coachId === 'ai_coach') {
      setIsTypingAI(true);
      const res = await getAICoachResponse(updatedChat.messages, knowledge, rules, sentText || "Phân tích ảnh", currentUser.healthGoal, latestMetric, sentImg?.split(',')[1]);
      if (res) setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter(c => c.trim())]); else setIsTypingAI(false);
    }
    setIsProcessingImage(false);
  };

  const handleAiChoice = useCallback(async (chat: ChatSession, choice: 'tham khảo' | 'bỏ qua') => {
    const msg: Message = { id: `c_${Date.now()}`, senderId: currentUid, senderName: currentUser.fullName, senderRole: currentUser.role, content: `${currentUser.fullName} chọn ${choice}.`, timestamp: new Date().toISOString() };
    const updated = { ...chat, messages: [...chat.messages, msg] };
    setSelectedChat(updated); await Database.saveChat(updated);
    if (choice === 'tham khảo') {
      setIsTypingAI(true);
      const res = await getAICoachResponse(updated.messages, knowledge, rules, "Cung cấp thông tin khoa học liên quan", currentUser.healthGoal, latestMetric);
      if (res) setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter(c => c.trim())]); else setIsTypingAI(false);
    }
  }, [currentUid, currentUser, knowledge, rules, latestMetric]);

  const getOtherUser = useCallback((chat: ChatSession) => {
    if (chat.coachId === 'ai_coach') return { fullName: '🍀Trợ lý Lucky', role: 'AI', id: 'ai_coach' };
    const otherId = currentUid === chat.memberId ? chat.coachId : chat.memberId;
    return users.find(u => ((u as any).id || (u as any)._id) === otherId);
  }, [currentUid, users]);

  return (
    <div className="fixed bottom-24 right-6 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 duration-300">
      <div className="p-5 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {!showContacts && <button onClick={() => setShowContacts(true)} className="p-2 hover:bg-white/10 rounded-xl transition-all">←</button>}
          <div className="font-black text-xs uppercase tracking-widest">{showContacts ? 'Hỗ trợ Lucky Hub' : getOtherUser(selectedChat!)?.fullName}</div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl transition-all">×</button>
      </div>

      {showContacts ? (
        <ContactList chats={chats} onSelect={(c) => { setSelectedChat(c); setShowContacts(false); }} getOtherUser={getOtherUser} />
      ) : selectedChat && (
        <>
          <ChatWindow 
            chat={selectedChat} currentUid={currentUid} isTypingAI={isTypingAI} 
            onAiChoice={handleAiChoice} showScrollButton={showScrollButton} 
            scrollToBottom={() => setShowScrollButton(false)} 
            onScroll={() => setShowScrollButton(false)} aiPromptText={AI_PROMPT_TEXT} 
          />
          <div className="p-4 bg-white border-t border-slate-50">
            {selectedImage && <div className="relative w-12 h-12 mb-2"><img src={selectedImage} className="w-full h-full object-cover rounded-lg" /><button onClick={() => setSelectedImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px]">×</button></div>}
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">📸</button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onload = () => setSelectedImage(r.result as string); r.readAsDataURL(f); }}} />
              <input placeholder="Gửi tin nhắn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-grow px-4 bg-slate-50 rounded-xl text-xs outline-none" />
              <button onClick={handleSendMessage} className="bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-lg">🚀</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatSystem;
