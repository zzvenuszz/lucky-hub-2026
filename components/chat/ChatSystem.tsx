import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User, UserRole, Message, ChatSession, AIKnowledge, AIRule, HealthMetric, HealthGoal } from '../../types.ts';
import { getAICoachResponse } from '../../services/gemini.ts';
import { Database } from '../../services/database.ts';
import { compressImage } from '../../utils/imageUtils.ts';
import ContactList from './ContactList.tsx';
import ChatWindow from './ChatWindow.tsx';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  preloadedChats: ChatSession[];
  onClose: () => void;
}

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge, rules, preloadedChats, onClose }) => {
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
  const [newMessageCount, setNewMessageCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUid = (currentUser as any).id || (currentUser as any)._id;
  const processedMsgIds = useRef<Set<string>>(new Set());
  const lastMessageCounts = useRef<Record<string, number>>({});
  const isAtBottomRef = useRef(true);
  const prevMessagesLength = useRef(0);

  /** Theo dõi số tin nhắn thay đổi để đếm tin nhắn mới khi không ở bottom */
  useEffect(() => {
    if (!selectedChat) return;
    const currentLength = selectedChat.messages.length;
    if (currentLength > prevMessagesLength.current) {
      if (!isAtBottomRef.current) {
        const diff = currentLength - prevMessagesLength.current;
        setNewMessageCount(prev => prev + diff);
        console.log(`[ChatSystem] ${diff} new message(s) while not at bottom, total: ${newMessageCount + diff}`);
      }
    }
    prevMessagesLength.current = currentLength;
  }, [selectedChat?.messages]);

  /** Reset đếm khi chọn chat khác */
  useEffect(() => {
    if (selectedChat) {
      prevMessagesLength.current = selectedChat.messages.length;
      setNewMessageCount(0);
    }
  }, [selectedChat?.id]);

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

  const checkNewMessagesAndAddPrompt = useCallback(async (chat: ChatSession) => {
    const prevCount = lastMessageCounts.current[chat.id] || 0;
    if (chat.messages.length <= prevCount || chat.coachId === 'ai_coach') return;

    const newMessages = chat.messages.slice(prevCount);
    let hasChanges = false;
    let updatedMsgs = [...chat.messages];

    for (const msg of newMessages) {
      if (msg.senderId === 'ai_coach' || msg.senderId === currentUid) continue;
      if (processedMsgIds.current.has(msg.id)) continue;

      if (knowledge.some(k => msg.content.toLowerCase().includes(k.keyword.toLowerCase()))) {
        console.log(`[ChatSystem] AI trigger detected: keyword match in message from ${msg.senderName}`);
        
        const promptMsg: Message = {
          id: `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          senderId: 'ai_coach',
          senderName: '🍀Trợ lý Lucky',
          senderRole: 'AI' as any,
          content: AI_PROMPT_TEXT,
          timestamp: new Date().toISOString()
        };
        
        updatedMsgs.push(promptMsg);
        processedMsgIds.current.add(msg.id);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      const updated = { ...chat, messages: updatedMsgs };
      await Database.saveChat(updated);
      setSelectedChat(prev => prev?.id === updated.id ? updated : prev);
      setChats(prev => prev.map(c => c.id === updated.id ? updated : c));
      console.log(`[ChatSystem] AI prompt added to chat ${chat.id}`);
    }

    lastMessageCounts.current[chat.id] = chat.messages.length;
  }, [knowledge, currentUid]);

  const loadData = useCallback(async () => {
    try {
      console.log(`[ChatSystem] Loading chat data for user ${currentUid}`);
      const metrics = await Database.getMetrics(currentUid);
      if (metrics?.length) setLatestMetric([...metrics].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]);
      const allChats = preloadedChats.length > 0 ? preloadedChats : (await Database.getChats() || []);
      
      let contacts = users.filter(u => {
        const uId = String((u as any).id || (u as any)._id);
        const myId = String(currentUid);
        
        if (uId === myId) return false;
        
        // Nếu là MEMBER, chỉ được nhắn cho ADMIN và COACH
        if (currentUser.role === UserRole.MEMBER) {
          const isStaff = u.role === UserRole.ADMIN || u.role === UserRole.COACH;
          return isStaff;
        }
        return true;
      });

      console.log(`[ChatSystem] Loaded contacts: ${contacts.length}, total chats: ${allChats.length}`);

      const activeChats = contacts.map(contact => {
        const cId = String((contact as any).id || (contact as any)._id);
        const myId = String(currentUid);
        return allChats.find(c => 
          (String(c.memberId) === myId && String(c.coachId) === cId) || 
          (String(c.memberId) === cId && String(c.coachId) === myId)
        ) || { id: `chat_${myId}_${cId}`, memberId: myId, coachId: cId, messages: [] };
      });
      const aiChatId = `chat_ai_${String(currentUid)}`;
      const aiChat = allChats.find(c => c.id === aiChatId) || { id: aiChatId, memberId: String(currentUid), coachId: 'ai_coach', messages: [] };
      const newChats = [aiChat, ...activeChats];
      setChats(newChats);

      // Kiểm tra tin nhắn mới từ người khác để trigger AI prompt
      for (const chat of newChats) {
        checkNewMessagesAndAddPrompt(chat);
      }
    } catch (error) {
      console.error(`[ChatSystem] Error loading chat data:`, error);
      // Graceful fallback - maintain existing chat state
    }
  }, [currentUid, users, currentUser.role]);

  useEffect(() => { loadData(); const interval = setInterval(() => { if (!isTypingAI) loadData(); }, 30000); return () => clearInterval(interval); }, [loadData, isTypingAI]);

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedImage) || !selectedChat) return;
    
    try {
      setIsProcessingImage(true);
      console.log(`[ChatSystem] Sending message to chat ${selectedChat.id}`);
      
      const sentText = inputText; 
      const sentImg = selectedImage ? await compressImage(selectedImage) : null;
      setInputText(''); 
      setSelectedImage(null);
      
      const msg: Message = { 
        id: `m_${Date.now()}`, 
        senderId: currentUid, 
        senderName: currentUser.fullName, 
        senderRole: currentUser.role, 
        content: sentText || "[Hình ảnh]", 
        imageUrl: sentImg || undefined, 
        timestamp: new Date().toISOString() 
      };
      
      let updatedMsgs = [...selectedChat.messages, msg];
      if (selectedChat.coachId !== 'ai_coach' && knowledge.some(k => sentText.toLowerCase().includes(k.keyword.toLowerCase()))) {
        updatedMsgs.push({ 
          id: `p_${Date.now()}`, 
          senderId: 'ai_coach', 
          senderName: '🍀Trợ lý Lucky', 
          senderRole: 'AI' as any, 
          content: AI_PROMPT_TEXT, 
          timestamp: new Date().toISOString() 
        });
      }
      
      const updatedChat = { ...selectedChat, messages: updatedMsgs };
      setSelectedChat(updatedChat); 
      await Database.saveChat(updatedChat);
      
      if (selectedChat.coachId === 'ai_coach') {
        setIsTypingAI(true);
        const userGoal = currentUser.healthGoals?.[0] || HealthGoal.OTHER;
        const res = await getAICoachResponse(updatedChat.messages, knowledge, rules, sentText || "Phân tích ảnh", userGoal, latestMetric, sentImg?.split(',')[1]);
        if (res) {
          setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter(c => c.trim())]);
          console.log(`[ChatSystem] AI response generated with ${res.split(/\n\n+/).length} parts`);
        } else {
          setIsTypingAI(false);
        }
      }
      
      console.log(`[ChatSystem] Message sent successfully`);
    } catch (error) {
      console.error(`[ChatSystem] Error sending message:`, error);
      // Graceful fallback - message may be partially saved
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleAiChoice = useCallback(async (chat: ChatSession, messageId: string, choice: 'tham khảo' | 'bỏ qua') => {
    console.log(`[ChatSystem] handleAiChoice: chat=${chat.id}, messageId=${messageId}, choice=${choice}, user=${currentUser.fullName}`);
    
    // Gắn meta vào prompt message cụ thể dựa trên messageId
    const updatedMsgs = chat.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          meta: {
            chosenBy: currentUid,
            chosenByName: currentUser.fullName,
            choice,
            chosenAt: new Date().toISOString()
          }
        };
      }
      return msg;
    });
    
    // Lưu xuống database
    const updatedChat = { ...chat, messages: updatedMsgs };
    await Database.saveChat(updatedChat);
    
    // Cập nhật state local
    setSelectedChat(prev => prev?.id === updatedChat.id ? updatedChat : prev);
    setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));
    
    console.log(`[ChatSystem] Choice saved: ${currentUser.fullName} chose "${choice}" on message ${messageId} in chat ${chat.id}`);
    
    // Nếu chọn "tham khảo", gọi AI để gửi thông tin
    if (choice === 'tham khảo') {
      setIsTypingAI(true);
      const userGoal2 = currentUser.healthGoals?.[0] || HealthGoal.OTHER;
      const res = await getAICoachResponse(updatedChat.messages, knowledge, rules, "Cung cấp thông tin khoa học liên quan", userGoal2, latestMetric);
      if (res) {
        setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter(c => c.trim())]);
      } else {
        setIsTypingAI(false);
      }
    }
  }, [currentUid, currentUser, knowledge, rules, latestMetric]);

  const getOtherUser = useCallback((chat: ChatSession) => {
    if (chat.coachId === 'ai_coach') return { fullName: '🍀Trợ lý Lucky', role: 'AI', id: 'ai_coach' };
    const otherId = String(currentUid) === String(chat.memberId) ? String(chat.coachId) : String(chat.memberId);
    return users.find(u => String((u as any).id || (u as any)._id) === otherId);
  }, [currentUid, users]);

  /** Callback để ChatWindow thông báo trạng thái scroll cho ChatSystem */
  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setNewMessageCount(0);
    }
  }, []);

  /** Callback khi ChatWindow scroll xuống cuối */
  const handleScrollToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setNewMessageCount(0);
    console.log(`[ChatSystem] Scrolled to bottom, reset newMessageCount`);
  }, []);

  return (
    <div className="fixed md:bottom-6 md:right-[90px] bottom-24 right-4 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 duration-300">
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
            onAiChoice={handleAiChoice}
            onAtBottomChange={handleAtBottomChange}
            scrollToBottom={handleScrollToBottom}
            aiPromptText={AI_PROMPT_TEXT}
            newMessageCount={newMessageCount}
          />
          <div className="p-4 bg-white border-t border-slate-50">
            {selectedImage && <div className="relative w-12 h-12 mb-2"><img src={selectedImage} className="w-full h-full object-cover rounded-lg" /><button onClick={() => setSelectedImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px]">×</button></div>}
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">📸</button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if(f){ const r = new FileReader(); r.onload = () => setSelectedImage(r.result as string); r.readAsDataURL(f); }}} />
              <input placeholder="Gửi tin nhắn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-grow px-4 bg-slate-50 rounded-xl text-xs outline-none" />
              <button onClick={handleSendMessage} className="bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-lg">🚀</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

ChatSystem.displayName = 'ChatSystem';

export default memo(ChatSystem);