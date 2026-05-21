/**
 * ChatProvider - Context quản lý state chat tập trung
 * Sử dụng WebSocket thay vì Socket.IO
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, memo } from 'react';
import { ChatSession, Message, User, MessageType, MessageStatus, WsEvent, AIKnowledge, AIRule, HealthGoal, HealthMetric, UserRole } from '../../types.ts';
import wsService from '../../services/wsService.ts';
import { Database } from '../../services/database.ts';
import { getAICoachResponse } from '../../services/gemini.ts';

// ===== Types =====
interface ChatContextType {
  chats: ChatSession[];
  selectedChat: ChatSession | null;
  isTypingAI: boolean;
  onlineUsers: Set<string>;
  unreadCounts: Record<string, number>;
  aiPromptText: string;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
  // Actions
  selectChat: (chat: ChatSession) => void;
  sendMessage: (text: string, imageBase64?: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;
  sendReaction: (chatId: string, messageId: string, emoji: string) => void;
  sendReadReceipt: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, newContent: string) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  clearChat: (chatId: string) => void;
  handleAiChoice: (chat: ChatSession, messageId: string, choice: 'tham khảo' | 'bỏ qua') => void;
  getOtherUser: (chat: ChatSession) => User | { fullName: string; role: string; id: string; avatar?: string } | undefined;
}

interface ChatProviderProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  preloadedChats: ChatSession[];
  children: React.ReactNode;
}

const AI_PROMPT_TEXT = "Trợ lý Lucky AI có thông tin về vấn đề bạn đang đề cập, bạn có muốn tham khảo không?";
const LS_READ_TIMESTAMPS = 'lucky_hub_chat_read_timestamps';

// ===== Context =====
const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};


// ===== Provider Component =====
const ChatProvider: React.FC<ChatProviderProps> = memo(({ 
  currentUser, users, knowledge, rules, preloadedChats, children 
}) => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [latestMetric, setLatestMetric] = useState<HealthMetric | undefined>(undefined);
  
  const currentUid = String((currentUser as any).id || (currentUser as any)._id);
  const chatsRef = useRef<ChatSession[]>([]);
  const selectedChatRef = useRef<ChatSession | null>(null);
  const processedAiMsgIds = useRef<Set<string>>(new Set());

  // Lưu lastReadTimestamps: chatId -> timestamp của tin nhắn cuối cùng đã đọc
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(LS_READ_TIMESTAMPS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Keep refs in sync
  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { selectedChatRef.current = selectedChat; }, [selectedChat]);

  // Lưu lastReadTimestamps xuống localStorage
  useEffect(() => {
    localStorage.setItem(LS_READ_TIMESTAMPS, JSON.stringify(lastReadTimestamps));
  }, [lastReadTimestamps]);

  // Rebuild unread counts whenever chats or lastReadTimestamps change
  // Chỉ bỏ qua chat đang được xem nếu khung chat đang mở (isChatOpen === true)
  const rebuildUnreadCounts = useCallback((chatList: ChatSession[], timestamps: Record<string, string>, selectedChatId?: string, chatOpen?: boolean) => {
    const counts: Record<string, number> = {};
    chatList.forEach(chat => {
      // Bỏ qua nếu chat này đang được xem VÀ khung chat đang mở
      if (chatOpen && chat.id === selectedChatId) return;
      if (chat.messages.length === 0) return;
      const count = chat.messages.filter(m => {
        // Chỉ đếm tin nhắn từ người khác (không phải currentUser, không phải AI)
        if (m.senderId === currentUid || m.senderId === 'ai_coach') return false;
        // Chỉ đếm tin nhắn sau lần đọc cuối
        const lastRead = timestamps[chat.id];
        if (!lastRead) return true; // chưa đọc lần nào → tất cả đều chưa đọc
        return m.timestamp > lastRead;
      }).length;
      if (count > 0) counts[chat.id] = count;
    });
    return counts;
  }, [currentUid]);

  // ===== Load initial data =====
  useEffect(() => {
    const load = async () => {
      try {
        console.log(`[ChatProvider] Loading data for user ${currentUid}, role=${currentUser.role}`);
        
        // Load metrics riêng - nếu lỗi thì bỏ qua, không ảnh hưởng đến chat
        try {
          const metrics = await Database.getMetrics(currentUid);
          if (metrics?.length) {
            const sorted = [...metrics].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setLatestMetric(sorted[0]);
          }
        } catch (metricErr) {
          console.warn(`[ChatProvider] Failed to load metrics, continuing without them:`, metricErr);
        }
        
        const allChats = preloadedChats.length > 0 ? preloadedChats : (await Database.getChats() || []);
        
        // Build contact list based on user role + NDD
        // - ADMIN: thấy tất cả users
        // - COACH: thấy tất cả users (coaches are NDD owners)
        // - MEMBER: chỉ thấy ADMIN + người trong cùng NDD (coach hoặc member khác)
        const userNutritionGroup = (currentUser as any).nutritionGroupId;
        
        const contacts = users.filter(u => {
          const uId = String((u as any).id || (u as any)._id);
          if (uId === currentUid) return false;
          
          // ADMIN/COACH thấy tất cả
          if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.COACH) {
            return true;
          }
          
          // MEMBER: chỉ thấy ADMIN + người cùng NDD
          if (currentUser.role === UserRole.MEMBER) {
            // Luôn thấy ADMIN
            if ((u as any).role === UserRole.ADMIN) return true;
            
            // MEMBER chỉ thấy người cùng NDD
            if (userNutritionGroup) {
              const otherNutritionGroup = (u as any).nutritionGroupId;
              if (otherNutritionGroup && String(otherNutritionGroup) === String(userNutritionGroup)) {
                return true;
              }
            }
            
            return false;
          }
          
          return true;
        });

        const myId = String(currentUid);
        const activeChats = contacts.map(contact => {
          const cId = String((contact as any).id || (contact as any)._id);
          return allChats.find((c: ChatSession) => 
            (String(c.memberId) === myId && String(c.coachId) === cId) || 
            (String(c.memberId) === cId && String(c.coachId) === myId)
          ) || { id: `chat_${myId}_${cId}`, memberId: myId, coachId: cId, messages: [] };
        });
        
        const aiChatId = `chat_ai_${String(currentUid)}`;
        const aiChat = allChats.find((c: ChatSession) => c.id === aiChatId) || { 
          id: aiChatId, memberId: String(currentUid), coachId: 'ai_coach', messages: [] 
        };
        
        const newChats = [aiChat, ...activeChats];
        setChats(newChats);

        console.log(`[ChatProvider] Loaded ${newChats.length} chats (role=${currentUser.role}, contacts=${contacts.length})`);
      } catch (error) {
        console.error(`[ChatProvider] Error loading data:`, error);
      }
    };
    load();
  }, [currentUid, users, currentUser.role, preloadedChats]);

  // Rebuild unread counts khi chats, lastReadTimestamps, selectedChat hoặc isChatOpen thay đổi
  useEffect(() => {
    const counts = rebuildUnreadCounts(chats, lastReadTimestamps, selectedChat?.id, isChatOpen);
    setUnreadCounts(counts);
    if (Object.keys(counts).length > 0) {
      console.log(`[ChatProvider] Unread counts rebuilt:`, counts);
    }
  }, [chats, lastReadTimestamps, selectedChat?.id, isChatOpen, rebuildUnreadCounts]);

  // ===== Process AI response queue =====
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
      timestamp: new Date().toISOString(),
      type: MessageType.TEXT,
      status: MessageStatus.SENT,
    };
    
    const updated = { ...selectedChat, messages: [...selectedChat.messages, aiMsg] };
    
    // Gửi qua WebSocket
    const myId = currentUid;
    const recipientId = selectedChat.coachId === 'ai_coach' 
      ? currentUid 
      : (String(myId) === String(selectedChat.memberId) ? selectedChat.coachId : selectedChat.memberId);
    
    wsService.send(WsEvent.CHAT_MESSAGE, {
      chatId: selectedChat.id,
      message: aiMsg,
      recipientId,
      memberId: selectedChat.memberId,
      coachId: selectedChat.coachId,
    });
    
    await Database.saveChat(updated);
    setSelectedChat(updated);
    setChats(prev => prev.map(c => c.id === updated.id ? updated : c));
    setPendingQueue(prev => prev.slice(1));
    setIsProcessingQueue(false);
    if (pendingQueue.length <= 1) setIsTypingAI(false);
  };

  // ===== WebSocket Listeners =====
  useEffect(() => {
    // Subscribe events
    const unsubMessage = wsService.on(WsEvent.CHAT_MESSAGE, (payload: any) => {
      const { chatId, message, fromUserId } = payload;
      console.log(`[ChatProvider] 📨 New message: chat=${chatId}, from=${message.senderId}`);

      // Kiểm tra nếu message từ người khác (không phải chính mình)
      const isFromOtherUser = message.senderId !== currentUid;
      const currentlySelectedChatId = selectedChatRef.current?.id;

      setChats(prev => {
        const existing = prev.find(c => c.id === chatId);
        if (existing) {
          const exists = existing.messages.some(m => m.id === message.id);
          if (exists) return prev;
          return prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, message] } : c);
        }
        // Create new chat
        const newChat: ChatSession = {
          id: chatId,
          memberId: fromUserId === String(currentUid) ? currentUid : fromUserId,
          coachId: fromUserId === String(currentUid) ? currentUid : fromUserId,
          messages: [message],
        };
        return [...prev, newChat];
      });

      // Tăng unread count nếu tin nhắn từ người khác và không đang xem chat đó
      if (isFromOtherUser && chatId !== currentlySelectedChatId) {
        // unread sẽ tự động được rebuild bởi useEffect bên dưới
      }

      setSelectedChat(prev => {
        if (prev?.id === chatId) {
          const exists = prev.messages.some(m => m.id === message.id);
          if (exists) return prev;
          return { ...prev, messages: [...prev.messages, message] };
        }
        return prev;
      });
    });

    const unsubMessageSent = wsService.on('chat:messageSent', (payload: any) => {
      // Cập nhật status cho message đã gửi
      const { chatId, messageId, status } = payload;
      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m => m.id === messageId ? { ...m, status } : m)
        };
      }));
      setSelectedChat(prev => {
        if (!prev || prev.id !== chatId) return prev;
        return {
          ...prev,
          messages: prev.messages.map(m => m.id === messageId ? { ...m, status } : m)
        };
      });
    });

    const unsubTyping = wsService.on(WsEvent.CHAT_TYPING, (payload: any) => {
      // Có thể hiển thị typing indicator cho từng chat
      console.log(`[ChatProvider] Typing: user=${payload.userId}, chat=${payload.chatId}`);
    });

    const unsubReaction = wsService.on(WsEvent.CHAT_REACTION, (payload: any) => {
      const { chatId, messageId, reaction } = payload;
      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m => {
            if (m.id !== messageId) return m;
            const existingReactions = m.reactions || [];
            const idx = existingReactions.findIndex(r => r.userId === reaction.userId && r.emoji === reaction.emoji);
            let newReactions;
            if (idx >= 0) {
              newReactions = [...existingReactions];
              newReactions.splice(idx, 1);
            } else {
              newReactions = [...existingReactions, reaction];
            }
            return { ...m, reactions: newReactions };
          })
        };
      }));
    });

    const unsubEdit = wsService.on(WsEvent.CHAT_EDIT, (payload: any) => {
      const { chatId, messageId, newContent, editedAt } = payload;
      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m => m.id === messageId ? { ...m, content: newContent, editedAt } : m)
        };
      }));
    });

    const unsubDelete = wsService.on(WsEvent.CHAT_DELETE, (payload: any) => {
      const { chatId, messageId } = payload;
      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return { ...chat, messages: chat.messages.filter(m => m.id !== messageId) };
      }));
      setSelectedChat(prev => {
        if (!prev || prev.id !== chatId) return prev;
        return { ...prev, messages: prev.messages.filter(m => m.id !== messageId) };
      });
    });

    const unsubClear = wsService.on(WsEvent.CHAT_CLEAR, (payload: any) => {
      const { chatId } = payload;
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [] } : c));
      setSelectedChat(prev => prev?.id === chatId ? { ...prev, messages: [] } : prev);
    });

    const unsubAiChoice = wsService.on('chat:aiChoiceUpdated', (payload: any) => {
      const { chatId, messageId, meta } = payload;
      setChats(prev => prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          messages: chat.messages.map(m => m.id === messageId ? { ...m, meta } : m)
        };
      }));
      setSelectedChat(prev => {
        if (!prev || prev.id !== chatId) return prev;
        return { ...prev, messages: prev.messages.map(m => m.id === messageId ? { ...m, meta } : m) };
      });
    });

    // Online status
    const unsubOnline = wsService.on(WsEvent.USER_ONLINE, (payload: any) => {
      setOnlineUsers(prev => new Set(prev).add(payload.userId));
    });

    const unsubOffline = wsService.on(WsEvent.USER_OFFLINE, (payload: any) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
    });

    const unsubOnlineList = wsService.on('users:online', (payload: any) => {
      setOnlineUsers(new Set(payload.userIds || []));
    });

    // Cleanup
    return () => {
      unsubMessage();
      unsubMessageSent();
      unsubTyping();
      unsubReaction();
      unsubEdit();
      unsubDelete();
      unsubClear();
      unsubAiChoice();
      unsubOnline();
      unsubOffline();
      unsubOnlineList();
    };
  }, [currentUid]);

  // ===== Actions =====

  const selectChat = useCallback((chat: ChatSession) => {
    setSelectedChat(chat);
    // Cập nhật lastReadTimestamp = timestamp của tin nhắn cuối cùng trong chat
    const lastMsg = chat.messages[chat.messages.length - 1];
    if (lastMsg) {
      setLastReadTimestamps(prev => ({
        ...prev,
        [chat.id]: lastMsg.timestamp
      }));
    }
  }, []);

  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    if ((!text.trim() && !imageBase64) || !selectedChat) return;

    try {
      console.log(`[ChatProvider] Sending message to chat ${selectedChat.id}`);

      const msg: Message = { 
        id: `m_${Date.now()}`, 
        senderId: currentUid, 
        senderName: currentUser.fullName, 
        senderRole: currentUser.role, 
        content: text || "[Hình ảnh]", 
        type: imageBase64 ? MessageType.IMAGE : MessageType.TEXT,
        status: MessageStatus.SENDING,
        timestamp: new Date().toISOString(),
        imageUrl: imageBase64 || undefined,
      };

      let updatedMsgs = [...selectedChat.messages, msg];

      // Check AI trigger
      if (selectedChat.coachId !== 'ai_coach' && knowledge.some(k => text.toLowerCase().includes(k.keyword.toLowerCase()))) {
        updatedMsgs.push({ 
          id: `p_${Date.now()}`, 
          senderId: 'ai_coach', 
          senderName: '🍀Trợ lý Lucky', 
          senderRole: 'AI' as any, 
          content: AI_PROMPT_TEXT, 
          timestamp: new Date().toISOString(),
          type: MessageType.TEXT,
          status: MessageStatus.SENT,
        });
      }

      const updatedChat = { ...selectedChat, messages: updatedMsgs };
      setSelectedChat(updatedChat);
      setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));

      const recipientId = selectedChat.coachId === 'ai_coach' 
        ? currentUid 
        : (String(currentUid) === String(selectedChat.memberId) ? selectedChat.coachId : selectedChat.memberId);

      // Gửi qua WebSocket + lưu DB
      wsService.send(WsEvent.CHAT_MESSAGE, {
        chatId: selectedChat.id,
        message: msg,
        recipientId,
        memberId: selectedChat.memberId,
        coachId: selectedChat.coachId,
      });
      await Database.saveChat(updatedChat);

      // AI response
      if (selectedChat.coachId === 'ai_coach') {
        setIsTypingAI(true);
        const userGoal = currentUser.healthGoals?.[0] || HealthGoal.OTHER;
        const res = await getAICoachResponse(
          updatedChat.messages, knowledge, rules, text || "Phân tích ảnh", 
          userGoal, latestMetric, imageBase64?.split(',')[1]
        );
        if (res) {
          setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter((c: string) => c.trim())]);
          console.log(`[ChatProvider] AI response generated with ${res.split(/\n\n+/).length} parts`);
        } else {
          setIsTypingAI(false);
        }
      }

      console.log(`[ChatProvider] Message sent successfully`);
    } catch (error) {
      console.error(`[ChatProvider] Error sending message:`, error);
    }
  }, [selectedChat, currentUid, currentUser, knowledge, rules, latestMetric]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!selectedChat) return;
    const recipientId = selectedChat.coachId === 'ai_coach' 
      ? currentUid 
      : (String(currentUid) === String(selectedChat.memberId) ? selectedChat.coachId : selectedChat.memberId);
    
    if (isTyping) {
      wsService.send(WsEvent.CHAT_TYPING, { chatId: selectedChat.id, recipientId, userName: currentUser.fullName });
    } else {
      wsService.send(WsEvent.CHAT_STOP_TYPING, { chatId: selectedChat.id, recipientId });
    }
  }, [selectedChat, currentUid, currentUser.fullName]);

  const sendReaction = useCallback((chatId: string, messageId: string, emoji: string) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const recipientId = String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId;
    
    wsService.send(WsEvent.CHAT_REACTION, {
      chatId,
      messageId,
      reaction: { userId: currentUid, userName: currentUser.fullName, emoji, timestamp: new Date().toISOString() },
      recipientId,
    });
  }, [currentUid, currentUser.fullName]);

  const sendReadReceipt = useCallback((chatId: string, messageId: string) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const recipientId = String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId;
    
    wsService.send(WsEvent.CHAT_READ, { chatId, lastReadMessageId: messageId, recipientId });
  }, [currentUid]);

  const editMessage = useCallback((chatId: string, messageId: string, newContent: string) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const recipientId = String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId;
    
    wsService.send(WsEvent.CHAT_EDIT, { chatId, messageId, newContent, recipientId });
    
    // Update local
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      return { ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, content: newContent, editedAt: new Date().toISOString() } : m) };
    }));
    setSelectedChat(prev => {
      if (!prev || prev.id !== chatId) return prev;
      return { ...prev, messages: prev.messages.map(m => m.id === messageId ? { ...m, content: newContent, editedAt: new Date().toISOString() } : m) };
    });
  }, [currentUid]);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const recipientId = String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId;
    
    wsService.send(WsEvent.CHAT_DELETE, { chatId, messageId, recipientId });
    
    // Update local
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      return { ...c, messages: c.messages.filter(m => m.id !== messageId) };
    }));
    setSelectedChat(prev => {
      if (!prev || prev.id !== chatId) return prev;
      return { ...prev, messages: prev.messages.filter(m => m.id !== messageId) };
    });
  }, [currentUid]);

  const clearChat = useCallback((chatId: string) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const recipientId = chat.coachId === 'ai_coach' 
      ? currentUid 
      : (String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId);
    
    wsService.send(WsEvent.CHAT_CLEAR, { chatId, recipientId });
    Database.clearChat(chatId);
    
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [] } : c));
    setSelectedChat(prev => prev?.id === chatId ? { ...prev, messages: [] } : prev);
  }, [currentUid]);

  const handleAiChoice = useCallback(async (chat: ChatSession, messageId: string, choice: 'tham khảo' | 'bỏ qua') => {
    console.log(`[ChatProvider] AI choice: ${choice} on ${messageId}`);
    
    const updatedMsgs = chat.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          meta: { chosenBy: currentUid, chosenByName: currentUser.fullName, choice, chosenAt: new Date().toISOString() }
        };
      }
      return msg;
    });
    const updatedChat = { ...chat, messages: updatedMsgs };
    
    setSelectedChat(prev => prev?.id === updatedChat.id ? updatedChat : prev);
    setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));
    
    const recipientId = String(currentUid) === String(chat.memberId) ? chat.coachId : chat.memberId;
    wsService.send(WsEvent.CHAT_MESSAGE, {
      chatId: chat.id,
      message: { id: messageId, meta: { chosenBy: currentUid, chosenByName: currentUser.fullName, choice, chosenAt: new Date().toISOString() } },
      recipientId,
    } as any);
    
    await Database.saveChat(updatedChat);
    
    if (choice === 'tham khảo') {
      setIsTypingAI(true);
      const userGoal = currentUser.healthGoals?.[0] || HealthGoal.OTHER;
      const res = await getAICoachResponse(updatedChat.messages, knowledge, rules, "Cung cấp thông tin khoa học liên quan", userGoal, latestMetric);
      if (res) {
        setPendingQueue(prev => [...prev, ...res.split(/\n\n+/).filter((c: string) => c.trim())]);
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

  const contextValue: ChatContextType = {
    chats, selectedChat, isTypingAI, onlineUsers, unreadCounts, aiPromptText: AI_PROMPT_TEXT,
    isChatOpen, setIsChatOpen,
    selectChat, sendMessage, sendTyping, sendReaction, sendReadReceipt,
    editMessage, deleteMessage, clearChat, handleAiChoice, getOtherUser,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
});

ChatProvider.displayName = 'ChatProvider';

export default ChatProvider;