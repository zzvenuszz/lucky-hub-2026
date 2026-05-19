/**
 * MessageBubble - Component hiển thị một tin nhắn
 * Hỗ trợ: reactions, reply, edit, delete, delivery status, AI prompt
 */
import React, { memo, useState, useCallback } from 'react';
import { Message, ChatSession, MessageType, MessageStatus } from '../../../types.ts';

interface MessageBubbleProps {
  message: Message;
  isMyMessage: boolean;
  isAiPrompt: boolean;
  aiPromptText: string;
  chat: ChatSession;
  onAiChoice: (chat: ChatSession, messageId: string, choice: 'tham khảo' | 'bỏ qua') => void;
  onReaction: (chatId: string, messageId: string, emoji: string) => void;
  onEdit: (chatId: string, messageId: string, newContent: string) => void;
  onDelete: (chatId: string, messageId: string) => void;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '😠'];

const MessageBubble: React.FC<MessageBubbleProps> = memo(({
  message, isMyMessage, isAiPrompt, aiPromptText, chat,
  onAiChoice, onReaction, onEdit, onDelete
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const handleEdit = useCallback(() => {
    if (editText.trim() && editText !== message.content) {
      onEdit(chat.id, message.id, editText.trim());
    }
    setIsEditing(false);
  }, [editText, message.content, message.id, chat.id, onEdit]);

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Status icon
  const statusIcon = () => {
    if (!isMyMessage) return null;
    switch (message.status) {
      case MessageStatus.SENDING: return <span className="text-[8px] text-slate-400 ml-1">⏳</span>;
      case MessageStatus.SENT: return <span className="text-[9px] text-slate-400 ml-1">✓</span>;
      case MessageStatus.DELIVERED: return <span className="text-[9px] text-emerald-400 ml-1">✓✓</span>;
      case MessageStatus.READ: return <span className="text-[9px] text-emerald-600 ml-1">✓✓</span>;
      case MessageStatus.FAILED: return <span className="text-[8px] text-red-500 ml-1">⚠️</span>;
      default: return null;
    }
  };

  return (
    <div className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'} group`}>
      <div className={`relative max-w-[85%] p-3.5 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap shadow-sm ${
        isAiPrompt ? 'bg-emerald-50/50 border border-emerald-200 text-slate-700 rounded-2xl' :
        message.senderRole === 'AI' ? 'bg-amber-50 border border-amber-100 text-slate-800 rounded-tl-none font-medium' : 
        isMyMessage ? 'bg-emerald-600 text-white rounded-tr-none' : 
        'bg-white text-slate-800 rounded-tl-none border border-slate-100'
      }`}>
        {/* Actions overlay (visible on hover) */}
        {!isAiPrompt && (
          <div className={`absolute top-1 ${isMyMessage ? 'left-1' : 'right-1'} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 rounded-lg px-1 py-0.5 shadow-sm border border-slate-100`}>
            {/* Emoji reaction */}
            <div className="relative">
              <button 
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="text-[10px] text-slate-400 hover:text-slate-600 px-0.5 hover:scale-110 transition-transform"
                title="Cảm xúc"
              >
                😊
              </button>
              {showEmojiPicker && (
                <div className={`absolute ${isMyMessage ? 'left-0' : 'right-0'} bottom-full mb-1 bg-white rounded-lg shadow-lg border p-1 flex gap-1 z-10`}>
                  {EMOJI_LIST.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { onReaction(chat.id, message.id, emoji); setShowEmojiPicker(false); }}
                      className="hover:scale-125 transition-transform text-sm px-0.5"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Edit (own message) */}
            {isMyMessage && (
              <button 
                onClick={() => { setEditText(message.content); setIsEditing(true); }}
                className="text-[10px] text-slate-400 hover:text-slate-600 px-0.5 hover:scale-110 transition-transform"
                title="Sửa"
              >
                ✏️
              </button>
            )}
            {/* Delete */}
            <button 
              onClick={() => { if (confirm('Xóa tin nhắn này?')) onDelete(chat.id, message.id); }}
              className="text-[10px] text-slate-400 hover:text-red-500 px-0.5 hover:scale-110 transition-transform"
              title="Xóa"
            >
              🗑️
            </button>
          </div>
        )}

        {/* Reply preview */}
        {message.replyTo && (
          <div className="border-l-2 border-slate-300 pl-2 mb-2 text-[10px] opacity-75">
            <span className="font-bold">{message.replyTo.senderName}</span>
            <p className="truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* Sender name */}
        {!isMyMessage && !isAiPrompt && message.senderRole !== 'AI' && (
          <span className="text-[9px] font-black uppercase text-slate-400 mb-1 block">{message.senderName}</span>
        )}
        {message.senderRole === 'AI' && !isAiPrompt && (
          <span className="text-[9px] font-black uppercase text-amber-600 mb-1 block">{message.senderName}</span>
        )}

        {/* Image */}
        {message.imageUrl && (
          <img src={message.imageUrl} className="rounded-xl mb-2 max-h-40 w-auto shadow-sm" alt="Attach" />
        )}

        {/* Content with edit mode */}
        {isEditing ? (
          <div className="flex gap-1">
            <input
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setIsEditing(false); }}
              className="flex-1 text-xs p-1 rounded border text-slate-800"
              autoFocus
            />
            <button onClick={handleEdit} className="text-[10px] bg-emerald-500 text-white px-2 rounded">Lưu</button>
            <button onClick={() => setIsEditing(false)} className="text-[10px] text-slate-400 px-1">✕</button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {message.content}
            {message.editedAt && (
              <span className="text-[8px] opacity-50 italic">(đã sửa)</span>
            )}
          </div>
        )}

        {/* Reactions display */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-white/20">
            {message.reactions.map((r, i) => (
              <span key={i} className="text-sm" title={r.userName}>{r.emoji}</span>
            ))}
          </div>
        )}

        {/* AI Prompt buttons */}
        {isAiPrompt && !message.meta?.choice && (
          <div className="mt-4 flex gap-2">
            <button 
              onClick={() => onAiChoice(chat, message.id, 'tham khảo')}
              className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md"
            >
              Tham khảo
            </button>
            <button 
              onClick={() => onAiChoice(chat, message.id, 'bỏ qua')}
              className="flex-1 bg-white text-slate-400 border border-slate-200 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Bỏ qua
            </button>
          </div>
        )}

        {/* AI Choice result */}
        {isAiPrompt && message.meta?.choice && (
          <div className={`mt-3 pt-3 border-t text-[11px] italic ${
            message.meta.choice === 'tham khảo' 
              ? 'border-emerald-200 text-emerald-600' 
              : 'border-slate-200 text-slate-500'
          }`}>
            👤 {message.meta.chosenByName} đã chọn {message.meta.choice === 'tham khảo' ? 'tham khảo thông tin' : 'bỏ qua'}
          </div>
        )}

        {/* Time + Status */}
        <div className="flex items-center justify-end mt-1">
          <span className={`text-[8px] ${isMyMessage ? 'text-emerald-200' : 'text-slate-400'} font-bold`}>
            {formatTime(message.timestamp)}
          </span>
          {statusIcon()}
        </div>
      </div>

    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;