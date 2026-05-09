
import React, { memo } from 'react';
import { User, ChatSession } from '../../types.ts';

interface ContactListProps {
  chats: ChatSession[];
  onSelect: (chat: ChatSession) => void;
  getOtherUser: (chat: ChatSession) => any;
}

const ContactList: React.FC<ContactListProps> = ({ chats, onSelect, getOtherUser }) => {
  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-2 no-scrollbar" style={{ overscrollBehavior: 'contain' }}>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2">Hội thoại của bạn</div>
      
      {chats.length === 0 ? (
        <div className="p-8 text-center space-y-4">
          <div className="text-4xl">🏜️</div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chưa có ai để chat</p>
          <p className="text-[10px] text-slate-300">Nếu bạn là thành viên, hãy chờ Admin hoặc Coach xuất hiện nhé!</p>
        </div>
      ) : chats.map(chat => {
        const other = getOtherUser(chat);
        if (!other) return null;
        return (
          <div key={chat.id} onClick={() => onSelect(chat)} className="p-4 bg-white rounded-2xl cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all border border-slate-50 flex items-center gap-3 group">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm overflow-hidden shrink-0 ${other.id === 'ai_coach' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {other.avatar ? (
                <img src={other.avatar} alt={other.fullName} className="w-full h-full object-cover" />
              ) : (
                <span>{other.id === 'ai_coach' ? '🍀' : other.fullName.charAt(0)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <div className="font-bold text-xs truncate group-hover:text-emerald-600 transition-colors">{other.fullName}</div>
                <span className="text-[8px] font-black uppercase text-slate-400">{other.role}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default memo(ContactList);
