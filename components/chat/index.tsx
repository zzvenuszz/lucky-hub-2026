/**
 * ChatSystem - UI component cho chat system
 * ChatProvider được quản lý ở App level (luôn active 24/7)
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { User } from '../../types.ts';
import { useChat } from './ChatProvider.tsx';
import ContactList from './components/ContactList.tsx';
import ChatWindow from './components/ChatWindow.tsx';
import LoadingButton from '../system/LoadingButton.tsx';

interface ChatSystemProps {
  currentUser: User;
  onClose: () => void;
}

const ChatSystem: React.FC<ChatSystemProps> = memo(({ onClose, currentUser }) => {
  const { selectedChat, getOtherUser, clearChat, setIsChatOpen } = useChat();
  const [showContacts, setShowContacts] = useState(true);
  const currentUid = String((currentUser as any).id || (currentUser as any)._id);

  // Đồng bộ trạng thái mở chat với ChatProvider
  useEffect(() => {
    setIsChatOpen(true);
    return () => setIsChatOpen(false);
  }, [setIsChatOpen]);

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
            <LoadingButton onClick={handleClearChat} variant="danger" size="sm" loadingText="..." className="!w-8 !h-8 !p-0 !rounded-full !bg-transparent !text-white hover:!bg-red-400/20 !text-sm !shadow-none" title="Xóa toàn bộ nội dung chat">
              🗑️
            </LoadingButton>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full font-bold text-xl transition-all">×</button>
        </div>
      </div>

      {/* Content */}
      {showContacts ? (
        <ContactList onSelectContact={() => setShowContacts(false)} />
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

ChatSystem.displayName = 'ChatSystem';

export default memo(ChatSystem);