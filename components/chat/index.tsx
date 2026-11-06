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
    <div data-chat-panel="true" className="fixed left-0 right-0 top-[60px] bottom-[calc(70px+env(safe-area-inset-bottom,0px))] z-[999] flex w-auto max-w-none flex-col overflow-hidden border-y border-slate-200 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl md:bottom-6 md:left-auto md:right-4 md:top-auto md:h-[600px] md:max-h-[85vh] md:w-[400px] md:max-w-[calc(100vw-2rem)] md:rounded-[32px] md:border">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 p-4 text-white">
        <div className="flex items-center gap-3">
          {!showContacts && (
            <button onClick={() => setShowContacts(true)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-lg transition hover:bg-white/15">
              ←
            </button>
          )}
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Lucky Chat</div>
            <div className="mt-1 text-sm font-black">
              {showContacts ? 'Hỗ trợ Lucky Hub' : getOtherUser(selectedChat!)?.fullName || 'Chat'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!showContacts && selectedChat && (
            <LoadingButton onClick={handleClearChat} variant="danger" size="sm" loadingText="..." className="!h-8 !w-8 !rounded-full !bg-white/10 !p-0 !text-lg !shadow-none hover:!bg-red-500/25" title="Xóa toàn bộ nội dung chat">
              🗑️
            </LoadingButton>
          )}
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-xl font-bold transition hover:bg-white/10">×</button>
        </div>
      </div>

      {showContacts ? (
        <ContactList onSelectContact={() => setShowContacts(false)} />
      ) : selectedChat ? (
        <ChatWindow chat={selectedChat} currentUid={currentUid} />
      ) : (
        <div className="flex flex-grow items-center justify-center bg-slate-50/40">
          <div className="text-center">
            <div className="mb-3 text-4xl">💬</div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Chọn cuộc hội thoại</p>
          </div>
        </div>
      )}
    </div>
  );
});

ChatSystem.displayName = 'ChatSystem';

export default memo(ChatSystem);
