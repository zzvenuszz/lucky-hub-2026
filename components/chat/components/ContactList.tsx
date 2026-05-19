/**
 * ContactList - Danh sách chat với online status, unread badge
 */
import React, { memo, useMemo } from 'react';
import { ChatSession } from '../../../types.ts';
import { useChat } from '../ChatProvider.tsx';

interface ContactListProps {
  onSelectContact?: (chat: ChatSession) => void;
}

const ContactList: React.FC<ContactListProps> = memo(({ onSelectContact }) => {
  const { chats, selectedChat, selectChat, getOtherUser, onlineUsers, unreadCounts } = useChat();

  const handleSelect = (chat: ChatSession) => {
    selectChat(chat);
    onSelectContact?.(chat);
  };

  // Sắp xếp chats: ưu tiên chưa đọc lên trên, sau đó theo tin nhắn gần nhất
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const aUnread = unreadCounts[a.id] || 0;
      const bUnread = unreadCounts[b.id] || 0;

      // Ưu tiên chưa đọc > 0 lên trên
      if (bUnread > 0 && aUnread === 0) return 1;
      if (aUnread > 0 && bUnread === 0) return -1;

      // Trong cùng nhóm, sắp xếp theo tin nhắn gần nhất
      const aLastMsg = a.messages[a.messages.length - 1];
      const bLastMsg = b.messages[b.messages.length - 1];
      
      if (aLastMsg && bLastMsg) {
        return new Date(bLastMsg.timestamp).getTime() - new Date(aLastMsg.timestamp).getTime();
      }
      if (aLastMsg) return -1;
      if (bLastMsg) return 1;
      return 0;
    });
  }, [chats, unreadCounts]);

  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar" style={{ overscrollBehavior: 'contain' }}>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">
        💬 Hội thoại của bạn
      </div>
      
      {chats.length === 0 ? (
        <div className="p-8 text-center space-y-4">
          <div className="text-4xl">🏜️</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chưa có ai để chat</p>
          <p className="text-[10px] text-slate-300">Nếu bạn là thành viên, hãy chờ Admin hoặc Coach xuất hiện nhé!</p>
        </div>
      ) : sortedChats.map(chat => {
        const other = getOtherUser(chat);
        if (!other) return null;
        
        const otherId = (other as any).id || (other as any)._id;
        const isOnline = onlineUsers.has(otherId);
        const unreadCount = unreadCounts[chat.id] || 0;
        const isSelected = selectedChat?.id === chat.id;
        const lastMessage = chat.messages[chat.messages.length - 1];

        return (
          <div 
            key={chat.id} 
            onClick={() => handleSelect(chat)} 
            className={`p-4 rounded-2xl cursor-pointer transition-all border flex items-center gap-3 group ${
              isSelected 
                ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                : 'bg-white border-slate-50 hover:shadow-md hover:scale-[1.02]'
            }`}
          >
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm overflow-hidden ${
                other.id === 'ai_coach' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {(other as any).avatar ? (
                  <img src={(other as any).avatar} alt={other.fullName} className="w-full h-full object-cover" />
                ) : (
                  <span>{other.id === 'ai_coach' ? '🍀' : other.fullName.charAt(0)}</span>
                )}
              </div>
              {/* Online dot */}
              {isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`font-bold text-xs truncate group-hover:text-emerald-600 transition-colors ${
                    isSelected ? 'text-emerald-700' : ''
                  }`}>
                    {other.fullName}
                  </div>
                  {isOnline && (
                    <span className="text-[8px] text-emerald-500 font-bold">🟢 online</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black uppercase text-slate-400">
                    {other.id === 'ai_coach' ? 'AI' : (other as any).role === 'ADMIN' ? 'ADMIN' : (other as any).role === 'COACH' ? 'COACH' : ''}
                  </span>
                  {/* Unread badge */}
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
              </div>

              {/* Last message preview */}
              {lastMessage && (
                <p className="text-[10px] text-slate-400 mt-1 truncate">
                  {lastMessage.senderId === (other as any).id ? '' : 'Bạn: '}
                  {lastMessage.content?.substring(0, 50)}
                  {lastMessage.content?.length > 50 ? '...' : ''}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

ContactList.displayName = 'ContactList';

export default ContactList;