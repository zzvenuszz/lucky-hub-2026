import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { User, TaggedUser } from '../../types.ts';

interface CommentFormProps {
  currentUser: User;
  users: User[];
  placeholder?: string;
  onSubmit: (content: string, taggedUsers: TaggedUser[]) => void;
  initialValue?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}

const CommentForm: React.FC<CommentFormProps> = memo(({
  currentUser, users, placeholder = 'Viết bình luận...',
  onSubmit, initialValue = '', autoFocus = false, onCancel
}) => {
  const [content, setContent] = useState(initialValue);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // Filter users for tag suggestions
  const filteredTagUsers = users.filter(u => {
    const uid = (u as any).id || (u as any)._id;
    if (uid === currentUser.id || uid === (currentUser as any)._id) return false;
    if (taggedUsers.find(t => t.userId === uid)) return false;
    return u.fullName.toLowerCase().includes(tagSearch.toLowerCase()) ||
           u.username?.toLowerCase().includes(tagSearch.toLowerCase());
  }).slice(0, 5);

  // Handle @ mention detection
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart || 0;
    setContent(val);
    setCursorPos(pos);

    // Check if we're typing @mention
    const textBefore = val.substring(0, pos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setTagSearch(atMatch[1]);
      setShowTagSuggestions(true);
    } else {
      setShowTagSuggestions(false);
    }
  }, []);

  // Select tagged user
  const handleTagUser = useCallback((user: User) => {
    const textBefore = content.substring(0, cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    const textAfter = content.substring(cursorPos);
    const newContent = textBefore.substring(0, atIndex) + `@${user.fullName} ` + textAfter;
    setContent(newContent);

    const uid = (user as any).id || (user as any)._id;
    setTaggedUsers(prev => [...prev, { userId: uid, userName: user.fullName }]);
    setShowTagSuggestions(false);
    inputRef.current?.focus();
  }, [content, cursorPos]);

  // Handle click outside tag suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setShowTagSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!content.trim()) return;
    onSubmit(content.trim(), taggedUsers);
    setContent('');
    setTaggedUsers([]);
  }, [content, taggedUsers, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-emerald-50 overflow-hidden shrink-0 mt-1">
        <img
          src={currentUser.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.fullName}`}
          className="w-full h-full object-cover"
          alt=""
        />
      </div>
      <div className="flex-1 relative">
        <textarea
          ref={inputRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={2}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
        />

        {/* Tag Suggestions */}
        {showTagSuggestions && filteredTagUsers.length > 0 && (
          <div
            ref={tagRef}
            className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-20"
          >
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider px-3 py-1.5 bg-slate-50">
              Gợi ý tag
            </p>
            {filteredTagUsers.map(u => {
              const uid = (u as any).id || (u as any)._id;
              return (
                <button
                  key={uid}
                  onClick={() => handleTagUser(u)}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-emerald-50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-emerald-50 overflow-hidden">
                    <img
                      src={u.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.fullName}`}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700">{u.fullName}</span>
                    <span className="text-[9px] text-slate-400 ml-1">@{u.username}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-1">
            {taggedUsers.length > 0 && (
              <span className="text-[9px] text-blue-500 font-medium">
                @{taggedUsers.map(t => t.userName).join(', @')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1"
              >
                Hủy
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!content.trim()}
              className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

CommentForm.displayName = 'CommentForm';
export default CommentForm;