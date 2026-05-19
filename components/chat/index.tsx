/**
 * ChatSystem - Entry point cho chat system mới
 * Sử dụng ChatProvider context + WebSocket
 */
import React, { memo, useState, useCallback } from 'react';
import { User, AIKnowledge, AIRule, ChatSession } from '../../types.ts';
import ChatProvider, { useChat } from './ChatProvider.tsx';
import ContactList from './components/ContactList.tsx';
import ChatWindow from './components/ChatWindow.tsx';

interface ChatSystemProps {
  currentUser: User;
  users: User[];
  knowledge: AIKnowledge[];
  rules: AIRule[];
  preloadedChats: ChatSession[];
  onClose: () => void;
}

const ChatContent: React.FC<{ onClose: () => void; currentUser: User }> = memo(({ onClose, currentUser }) => {
  const { selectedChat, getOtherUser, clearChat } = useChat();
  const [showContacts, setShowContacts] = useState(true);
  const currentUid = String((currentUser as any).id || (currentUser as any)._id);

  const handleClearChat = useCallback(() => {
    if (!selectedChat) return;
    if (!window.confirm('Bạn có chắc muốn xóa toàn bộ nội dung chat với người này?')) return;
    clearChat(selectedChat.id);
  }, [selectedChat, clearChat]);

  return (
    <div className="fixed md:bottom-6 md:right-[90px] bottom-24 right-4 w-[400px] max-w-[95vw] h-[600px] max-h-[85vh] bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden z-[999] animate-in slide-in-from-bottom-6 duration-300">
      {/* Header */}
      <div className="p-5 bg-emerald-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {!showContacts && (
            <button onClick={() => setShowContacts(true)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
              ←
            </button>
          )}
          <div className="font-black text-xs uppercase tracking-widest">
            {showContacts ? 'Hỗ trợ Lucky Hub' : getOtherUser(selectedChat!)?.fullName || 'Chat'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!showContacts && selectedChat && (
            <button onClick={handleClearChat} className="w-8 h-8 flex items-center justify-center hover:bg-red-400/20 rounded-full transition-all text-sm" title="Xóa toàn bộ nội dung chat">🗑️</button>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl transition-all">×</button>
        </div>
      </div>

      {/* Content */}
      {showContacts ? (
        <ContactList />
      ) : selectedChat ? (
        <ChatWindow chat={selectedChat} currentUid={currentUid} />
      ) : (
        <div className="flex-grow flex items-center justify-center">
          <p className="text-xs text-slate-400 font-bold">Chọn một cuộc hội thoại</p>
        </div>
      )}
    </div>
  );
});

ChatContent.displayName = 'ChatContent';

const ChatSystem: React.FC<ChatSystemProps> = memo(({ currentUser, users, knowledge, rules, preloadedChats, onClose }) => {
  return (
    <ChatProvider currentUser={currentUser} users={users} knowledge={knowledge} rules={rules} preloadedChats={preloadedChats}>
      <ChatContent onClose={onClose} currentUser={currentUser} />
    </ChatProvider>
  );
});

ChatSystem.displayName = 'ChatSystem';

export default memo(ChatSystem);