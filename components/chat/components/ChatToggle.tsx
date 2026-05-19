/**
 * ChatToggle - Nút mở chat đặt trên header, hiển thị badge đỏ tổng số tin nhắn chưa đọc
 */
import React, { memo } from 'react';
import { useChat } from '../ChatProvider.tsx';

interface ChatToggleProps {
  isChatOpen: boolean;
  onToggle: () => void;
}

const ChatToggle: React.FC<ChatToggleProps> = memo(({ isChatOpen, onToggle }) => {
  const { unreadCounts } = useChat();

  // Tính tổng số unread messages từ tất cả các chat
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="relative shrink-0">
      <button
        onClick={onToggle}
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
          isChatOpen
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
        }`}
        title="Tin nhắn"
      >
        <span className="text-lg">{isChatOpen ? '✉️' : '💬'}</span>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-lg shadow-rose-200">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
});

ChatToggle.displayName = 'ChatToggle';
export default ChatToggle;