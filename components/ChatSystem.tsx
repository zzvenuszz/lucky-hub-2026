
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Message, ChatSession, AIKnowledge } from '../types';
import { getAICoachResponse } from '../services/gemini';
import { Database } from '../services/database';

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

  useEffect(() => {
    const allChats = Database.getChats();
    const coaches = users.filter(u => u.role === UserRole.COACH);

    if (currentUser.role === UserRole.MEMBER) {
      // Hội viên: Hiển thị/tạo chat với các HLV
      const memberChats = coaches.map(coach => {
        let chat = allChats.find(c => c.memberId === currentUser.id && c.coachId === coach.id);
        if (!chat) {
          chat = { id: `chat_${currentUser.id}_${coach.id}`, memberId: currentUser.id, coachId: coach.id, messages: [] };
        }
        return chat;
      });
      setChats(memberChats);
    } else if (currentUser.role === UserRole.COACH) {
      // HLV: Hiển thị chat với tất cả hội viên
      const members = users.filter(u => u.role === UserRole.MEMBER);
      const coachChats = members.map(member => {
        let chat = allChats.find(c => c.memberId === member.id && c.coachId === currentUser.id);
        if (!chat) {
          chat = { id: `chat_${member.id}_${currentUser.id}`, memberId: member.id, coachId: currentUser.id, messages: [] };
        }
        return chat;
      });
      setChats(coachChats);
    } else {
      // Admin: Xem được tất cả
      setChats(allChats);
    }
  }, [currentUser, users]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedChat]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedChat) return;

    const newMessage: Message = {
      id: `msg_${Date.now()}`, senderId: currentUser.id, senderName: currentUser.fullName, senderRole: currentUser.role,
      content: inputText, timestamp: new Date().toISOString()
    };

    const updatedChat = { ...selectedChat, messages: [...selectedChat.messages, newMessage] };
    const allChats = Database.getChats();
    const chatIndex = allChats.findIndex(c => c.id === updatedChat.id);
    if (chatIndex > -1) allChats[chatIndex] = updatedChat; else allChats.push(updatedChat);
    
    Database.saveChats(allChats);
    setSelectedChat(updatedChat);
    setInputText('');

    // AI Coach Advisor
    setIsTypingAI(true);
    const aiResponse = await getAICoachResponse(updatedChat.messages, knowledge, inputText);
    
    if (aiResponse) {
      const aiMessage: Message = {
        id: `msg_ai_${Date.now()}`, senderId: 'ai_coach', senderName: 'Lucky AI Advisor', senderRole: 'AI' as any,
        content: aiResponse, timestamp: new Date().toISOString()
      };
      const finalChat = { ...updatedChat, messages: [...updatedChat.messages, aiMessage] };
      const finalAllChats = Database.getChats().map(c => c.id === finalChat.id ? finalChat : c);
      Database.saveChats(finalAllChats);
      setSelectedChat(finalChat);
    }
    setIsTypingAI(false);
  };

  const getOtherUser = (chat: ChatSession) => {
    const id = currentUser.id === chat.memberId ? chat.coachId : chat.memberId;
    return users.find(u => u.id === id);
  };

  return (
    <div className="flex h-[75vh] bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
      <div className="w-1/3 border-r border-slate-50 flex flex-col bg-slate-50/20">
        <div className="p-6 border-b border-slate-50 font-bold text-slate-800">Hội thoại</div>
        <div className="flex-grow overflow-y-auto">
          {chats.map(chat => (
            <div key={chat.id} onClick={() => setSelectedChat(chat)} className={`p-4 mx-3 my-1 rounded-2xl cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-emerald-50 text-slate-600'}`}>
              <div className="font-bold text-sm">{getOtherUser(chat)?.fullName || 'Người dùng'}</div>
              <div className={`text-[10px] truncate ${selectedChat?.id === chat.id ? 'text-emerald-100' : 'text-slate-400'}`}>
                {chat.messages.length > 0 ? chat.messages[chat.messages.length-1].content : 'Chưa có tin nhắn'}
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
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-600">
                  {getOtherUser(selectedChat)?.fullName.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-800">{getOtherUser(selectedChat)?.fullName}</div>
                  <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Trực tuyến</div>
                </div>
              </div>
            </div>
            
            <div ref={scrollRef} className="flex-grow p-6 overflow-y-auto space-y-4 bg-slate-50/30">
              {selectedChat.messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === currentUser.id ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-3xl text-sm shadow-sm ${
                    msg.senderRole === 'AI' 
                      ? 'bg-amber-50 border border-amber-200 text-slate-800 rounded-tl-none' 
                      : msg.senderId === currentUser.id 
                        ? 'bg-emerald-600 text-white rounded-tr-none' 
                        : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    {msg.senderRole === 'AI' && <div className="text-[9px] font-black text-amber-600 mb-1 uppercase tracking-widest">Lucky AI Advisor 🤖</div>}
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-2 font-bold uppercase">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              ))}
              {isTypingAI && <div className="text-[10px] text-amber-500 font-bold animate-pulse px-2">AI đang phân tích câu hỏi...</div>}
            </div>

            <div className="p-4 bg-white border-t border-slate-50 flex gap-2">
              <input 
                placeholder="Gửi tin nhắn tư vấn..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                className="flex-grow px-5 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
              <button onClick={handleSendMessage} className="bg-emerald-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center hover:bg-emerald-700 transition-all shadow-lg">🚀</button>
            </div>
          </>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center text-slate-300">
            <div className="text-6xl mb-4">💬</div>
            <p className="font-bold italic">Chọn một HLV để bắt đầu hành trình sức khỏe</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatSystem;
