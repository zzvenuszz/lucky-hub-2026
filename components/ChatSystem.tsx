
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Message, ChatSession, AIKnowledge } from '../types.ts';
import { getAICoachResponse } from '../services/gemini.ts';
import { Database } from '../services/database.ts';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
}

const ChatSystem: React.FC<ChatSystemProps> = ({ currentUser, users, knowledge }) => {
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [inputText, setInputText] = useState('');
  const [isTypingAI, setIsTypingAI] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadAllChats = async () => {
    const allChats = await Database.getChats() || [];
    const coaches = users.filter(u => u.role === UserRole.COACH);

    if (currentUser.role === UserRole.MEMBER) {
      const memberChats = coaches.map(coach => {
        let chat = allChats.find(c => c.memberId === currentUser.id && c.coachId === coach.id);
        if (!chat) chat = { id: `chat_${currentUser.id}_${coach.id}`, memberId: currentUser.id, coachId: coach.id, messages: [] };
        return chat;
      });
      setChats(memberChats);
    } else if (currentUser.role === UserRole.COACH) {
      const members = users.filter(u => u.role === UserRole.MEMBER);
      const coachChats = members.map(member => {
        let chat = allChats.find(c => c.memberId === member.id && c.coachId === currentUser.id);
        if (!chat) chat = { id: `chat_${member.id}_${currentUser.id}`, memberId: member.id, coachId: currentUser.id, messages: [] };
        return chat;
      });
      setChats(coachChats);
    } else {
      setChats(allChats);
    }
  };

  useEffect(() => {
    loadAllChats();
    // Polling nhẹ để cập nhật tin nhắn mới (giả lập realtime)
    const interval = setInterval(loadAllChats, 10000);
    return () => clearInterval(interval);
  }, [currentUser, users]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedChat, isTypingAI]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedChat) return;

    const newMessage: Message = {
      id: `msg_${Date.now()}`, 
      senderId: currentUser.id, 
      senderName: currentUser.fullName, 
      senderRole: currentUser.role,
      content: inputText, 
      timestamp: new Date().toISOString()
    };

    const updatedChat = { ...selectedChat, messages: [...selectedChat.messages, newMessage] };
    await Database.saveChat(updatedChat);
    setSelectedChat(updatedChat);
    setInputText('');

    setIsTypingAI(true);
    try {
      const aiResponse = await getAICoachResponse(updatedChat.messages, knowledge, inputText);
      if (aiResponse) {
        const aiMessage: Message = {
          id: `msg_ai_${Date.now()}`, 
          senderId: 'ai_coach', 
          senderName: 'Lucky AI Advisor', 
          senderRole: 'AI' as any,
          content: aiResponse, 
          timestamp: new Date().toISOString()
        };
        const finalChat = { ...updatedChat, messages: [...updatedChat.messages, aiMessage] };
        await Database.saveChat(finalChat);
        setSelectedChat(finalChat);
      }
    } finally {
      setIsTypingAI(false);
    }
  };

  const getOtherUser = (chat: ChatSession) => {
    const id = currentUser.id === chat.memberId ? chat.coachId : chat.memberId;
    return users.find(u => ((u as any).id || (u as any)._id) === id);
  };

  return (
    <div className="flex h-[75vh] bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
      <div className="w-1/3 border-r border-slate-50 flex flex-col bg-slate-50/20">
        <div className="p-6 border-b border-slate-50 font-black text-xs uppercase tracking-widest text-slate-400">Danh sách hội thoại</div>
        <div className="flex-grow overflow-y-auto p-2">
          {chats.map(chat => (
            <div key={chat.id} onClick={() => setSelectedChat(chat)} className={`p-4 mb-2 rounded-[1.5rem] cursor-pointer transition-all border ${selectedChat?.id === chat.id ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 border-emerald-600 scale-[1.02]' : 'hover:bg-white border-transparent text-slate-600 hover:shadow-sm'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black ${selectedChat?.id === chat.id ? 'bg-white/20' : 'bg-emerald-50 text-emerald-600'}`}>
                  {getOtherUser(chat)?.fullName.charAt(0) || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{getOtherUser(chat)?.fullName || 'Hội viên'}</div>
                  <div className={`text-[10px] truncate ${selectedChat?.id === chat.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {chat.messages.length > 0 ? chat.messages[chat.messages.length-1].content : 'Chưa có tin nhắn'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-grow flex flex-col">
        {selectedChat ? (
          <>
            <div className="p-5 bg-white border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-lg">
                  {getOtherUser(selectedChat)?.fullName.charAt(0) || '?'}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{getOtherUser(selectedChat)?.fullName}</div>
                  <div className="text-[10px] text-emerald-500 font-black uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Đồng bộ Cloud
                  </div>
                </div>
              </div>
            </div>
            
            <div ref={scrollRef} className="flex-grow p-6 overflow-y-auto space-y-6 bg-slate-50/20">
              {selectedChat.messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUser.id ? 'items-end' : 'items-start'}`}>
                  {msg.senderRole === 'AI' && (
                    <div className="flex items-center gap-2 mb-1.5 ml-1">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">🤖 Lucky AI Advisor</span>
                    </div>
                  )}
                  <div className={`max-w-[80%] p-4 rounded-3xl text-sm shadow-sm leading-relaxed transition-all ${
                    msg.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100 text-slate-800 rounded-tl-none' : msg.senderId === currentUser.id ? 'bg-emerald-600 text-white rounded-tr-none shadow-emerald-50' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1.5 px-2 font-bold uppercase tracking-tighter">
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              ))}
              {isTypingAI && (
                <div className="flex items-center gap-3 ml-2">
                  <div className="flex space-x-1"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>
                  <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest">AI đang suy nghĩ...</span>
                </div>
              )}
            </div>

            <div className="p-5 bg-white border-t border-slate-50 flex gap-3">
              <input placeholder="Nhập tin nhắn tư vấn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} className="flex-grow px-6 py-4 bg-slate-50 rounded-[1.5rem] border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium transition-all" />
              <button onClick={handleSendMessage} disabled={!inputText.trim()} className="bg-emerald-600 text-white w-14 h-14 rounded-[1.5rem] flex items-center justify-center hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 text-xl">🚀</button>
            </div>
          </>
        ) : <div className="flex-grow flex flex-col items-center justify-center text-slate-300 p-10"><div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-5xl mb-6 shadow-inner">💬</div><p className="font-black text-xs uppercase tracking-[0.2em]">Chọn một hội thoại</p></div>}
      </div>
    </div>
  );
};

export default ChatSystem;
