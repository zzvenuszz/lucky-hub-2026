import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User, UserRole, Message, ChatSession, AIKnowledge, AIRule, HealthMetric, HealthGoal } from '../../types.ts';
import { getAICoachResponse } from '../../services/gemini.ts';
import { Database } from '../../services/database.ts';
import { compressImage } from '../../utils/imageUtils.ts';
import { getSocket, emitEvent } from '../../services/socketService.ts';
import ContactList from './ContactList.tsx';
import ChatWindow from './ChatWindow.tsx';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  preloadedChats: ChatSession[];
  onClose: () => void;
  onNewMessage?: (count: number) => void; // callback báo cho App có tin nhắn mới
}

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge, rules, preloadedChats, onClose, onNewMessage }) => {
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
  const chatsRef = useRef<ChatSession[]>([]);
  const loadedContacts = useRef<string[]>([]); // Lưu danh sách contacts đã load để tạo chat mới

  // Keep chatsRef in sync
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

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
    const aiMsg: Message = { 
      id: `ai_${Date.now()}`, 
      senderId: 'ai_coach', 
      senderName: '🍀Trợ lý Lucky', 
      senderRole: 'AI' as any, 
      content: textToDisplay, 
      timestamp: new Date().toISOString() 
    };
    
    const updated = { ...selectedChat, messages: [...selectedChat.messages, aiMsg] };
    emitEvent('chat:sendMessage', {
      chatId: selectedChat.id,
      message: aiMsg,
      recipientId: currentUid,
      memberId: selectedChat.memberId,
      coachId: selectedChat.coachId,
    });
    
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
      const allChats = await Database.getChats() || [];
      
      let contacts = users.filter(u => {
        const uId = String((u as any).id || (u as any)._id);
        const myId = String(currentUid);
        if (uId === myId) return false;
        if (currentUser.role === UserRole.MEMBER) {
          return u.role === UserRole.ADMIN || u.role === UserRole.COACH;
        }
        return true;
      });

      // Lưu danh sách contacts để tạo chat mới khi cần
      loadedContacts.current = contacts.map(c => String((c as any).id || (c as any)._id));

      const myId = String(currentUid);
      const activeChats = contacts.map(contact => {
        const cId = String((contact as any).id || (contact as any)._id);
        return allChats.find(c => 
          (String(c.memberId) === myId && String(c.coachId) === cId) || 
          (String(c.memberId) === cId && String(c.coachId) === myId)
        ) || { id: `chat_${myId}_${cId}`, memberId: myId, coachId: cId, messages: [] };
      });
      const aiChatId = `chat_ai_${String(currentUid)}`;
      const aiChat = allChats.find(c => c.id === aiChatId) || { id: aiChatId, memberId: String(currentUid), coachId: 'ai_coach', messages: [] };
      const newChats = [aiChat, ...activeChats];
      setChats(newChats);

      for (const chat of newChats) {
        checkNewMessagesAndAddPrompt(chat);
      }
      
      console.log(`[ChatSystem] Loaded ${newChats.length} chats`);
    } catch (error) {
      console.error(`[ChatSystem] Error loading chat data:`, error);
    }
  }, [currentUid, users, currentUser.role]);

  // Load khi mount + re-load mỗi 30s để đồng bộ DB (fallback)
  useEffect(() => { 
    loadData(); 
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Socket.IO real-time listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Xử lý tin nhắn mới - QUAN TRỌNG: tạo chat mới nếu chatId chưa tồn tại
    const handleNewMessage = (data: any) => {
      const { chatId, message } = data;
      console.log(`[ChatSystem] 📨 New message via socket: chat=${chatId}, from=${message.senderId}, content=${message.content?.substring(0, 50)}`);

      // Tìm xem chat đã tồn tại trong state chưa
      const existingChat = chatsRef.current.find(c => c.id === chatId);
      
      if (existingChat) {
        // Nếu chat đã tồn tại → append message + kiểm tra trùng
        const exists = existingChat.messages.some(m => m.id === message.id);
        if (exists) return; // Bỏ qua nếu đã có (tránh trùng lặp)

        setChats(prev => prev.map(c => 
          c.id === chatId ? { ...c, messages: [...c.messages, message] } : c
        ));
        setSelectedChat(prev => 
          prev?.id === chatId ? { ...prev, messages: [...prev.messages, message] } : prev
        );
      } else {
        // CHAT MỚI CHƯA TỒN TẠI TRONG STATE → tạo mới ngay lập tức
        console.log(`[ChatSystem] ⭐ Creating new chat from socket message: ${chatId}`);
        const newChat: ChatSession = {
          id: chatId,
          memberId: data.fromUserId === String(currentUid) ? currentUid : data.fromUserId,
          coachId: data.fromUserId === String(currentUid) ? currentUid : data.fromUserId,
          messages: [message],
        };
        setChats(prev => [...prev, newChat]);
      }

      // Kiểm tra AI prompt trigger (nếu có chat)
      const chat = chatsRef.current.find(c => c.id === chatId) || 
                    { id: chatId, memberId: '', coachId: '', messages: [message] };
      checkNewMessagesAndAddPrompt({ ...chat, messages: [...chat.messages, message] });
    };

    const handleAiChoiceUpdated = (data: any) => {
      const { chatId, messageId, meta } = data;
      console.log(`[ChatSystem] AI choice updated: chat=${chatId}, msg=${messageId}`);

      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        const updatedMsgs = chat.messages.map(msg => 
          msg.id === messageId ? { ...msg, meta } : msg
        );
        return { ...chat, messages: updatedMsgs };
      }));

      setSelectedChat(prev => {
        if (!prev || prev.id !== chatId) return prev;
        const updatedMsgs = prev.messages.map(msg => 
          msg.id === messageId ? { ...msg, meta } : msg
        );
        return { ...prev, messages: updatedMsgs };
      });
    };

    const handleChatCleared = (data: any) => {
      const { chatId } = data;
      console.log(`[ChatSystem] Chat cleared: ${chatId}`);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [] } : c));
      setSelectedChat(prev => prev?.id === chatId ? { ...prev, messages: [] } : prev);
    };

    const handleAiTypingStatus = (data: any) => {
      const { isTyping } = data;
      setIsTypingAI(isTyping);
    };

    socket.on('chat:newMessage', handleNewMessage);
    socket.on('chat:aiChoiceUpdated', handleAiChoiceUpdated);
    socket.on('chat:cleared', handleChatCleared);
    socket.on('chat:aiTypingStatus', handleAiTypingStatus);

    return () => {
      socket.off('chat:newMessage', handleNewMessage);
      socket.off('chat:aiChoiceUpdated', handleAiChoiceUpdated);
      socket.off('chat:cleared', handleChatCleared);
      socket.off('chat:aiTypingStatus', handleAiTypingStatus);
    };
  }, [checkNewMessagesAndAddPrompt, currentUid]);

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
      
      // Cập nhật local ngay lập tức
      setSelectedChat(updatedChat);
      setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));

      const recipientId = selectedChat.coachId === 'ai_coach' 
        ? currentUid 
        : (String(currentUid) === String(selectedChat.memberId) ? selectedChat.coachId : selectedChat.memberId);

      // Gửi qua socket (server lưu DB + broadcast)
      emitEvent('chat:sendMessage', {
        chatId: selectedChat.id,
        message: msg,
        recipientId,
        memberId: selectedChat.memberId,
        coachId: selectedChat.coachId,
      });
      
      // Lưu fallback qua REST
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
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleAiChoice = useCallback(async (chat: ChatSession, messageId: string, choice: 'tham khảo' | 'bỏ qua') => {
    console.log(`[ChatSystem] handleAiChoice: chat=${chat.id}, messageId=${messageId}, choice=${choice}, user=${currentUser.fullName}`);
    
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
    
    const updatedChat = { ...chat, messages: updatedMsgs };
    
    setSelectedChat(prev => prev?.id === updatedChat.id ? updatedChat : prev);
    setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));
    
    emitEvent('chat:aiChoice', {
      chatId: chat.id,
      messageId,
      choice,
      chosenBy: currentUid,
      chosenByName: currentUser.fullName,
    });
    
    await Database.saveChat(updatedChat);
    
    console.log(`[ChatSystem] Choice saved: ${currentUser.fullName} chose "${choice}" on message ${messageId} in chat ${chat.id}`);
    
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

  const handleAtBottomChange = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setNewMessageCount(0);
    }
  }, []);

  const handleClearChat = useCallback(async () => {
    if (!selectedChat) return;
    if (!window.confirm('Bạn có chắc muốn xóa toàn bộ nội dung chat với người này?')) return;
    
    console.log(`[ChatSystem] Clearing chat ${selectedChat.id}`);
    
    const recipientId = selectedChat.coachId === 'ai_coach' 
      ? currentUid 
      : (String(currentUid) === String(selectedChat.memberId) ? selectedChat.coachId : selectedChat.memberId);
    
    emitEvent('chat:clear', { chatId: selectedChat.id, recipientId });
    await Database.clearChat(selectedChat.id);
    
    const clearedChat = { ...selectedChat, messages: [] };
    setSelectedChat(clearedChat);
    setChats(prev => prev.map(c => c.id === clearedChat.id ? clearedChat : c));
    console.log(`[ChatSystem] Chat ${selectedChat.id} cleared successfully`);
  }, [selectedChat, currentUid]);

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
        <div className="flex items-center gap-1">
          {!showContacts && selectedChat && (
            <button onClick={handleClearChat} className="w-8 h-8 flex items-center justify-center hover:bg-red-400/20 rounded-full transition-all text-sm" title="Xóa toàn bộ nội dung chat">
              🗑️
            </button>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl transition-all">×</button>
        </div>
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