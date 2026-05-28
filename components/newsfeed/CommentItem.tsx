import React, { useState, useCallback, memo } from 'react';
import { Comment, User, TaggedUser } from '../../types.ts';
import { formatTimeAgo } from '../../utils/formatters.ts';
import CommentForm from './CommentForm.tsx';

interface CommentItemProps {
  comment: Comment;
  currentUser: User;
  users: User[];
  postId: string;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  onReact: (commentId: string) => void;
  onReply: (content: string, taggedUsers: TaggedUser[], parentId: string) => void;
  level?: number;
}

const CommentItem: React.FC<CommentItemProps> = memo(({
  comment, currentUser, users, postId, onEdit, onDelete, onReact, onReply, level = 0
}) => {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const isOwner = comment.userId === currentUserId;
  const isAdmin = (currentUser as any).permissions?.includes('admin:panel');
  const maxNestingLevel = 3;

  // Render content with @tag highlighting
  const renderContent = (text: string, taggedUsers?: TaggedUser[]) => {
    if (!text) return null;
    // Highlight @mentions
    const parts = text.split(/(@\w+(?:\s\w+)?)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@') && part.length > 1) {
        const isTagged = taggedUsers?.some(t => part.includes(t.userName));
        return (
          <span key={idx} className={`font-bold ${isTagged ? 'text-blue-500' : 'text-blue-400'}`}>
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const handleReplySubmit = useCallback((content: string, taggedUsers: TaggedUser[]) => {
    onReply(content, taggedUsers, comment.id);
    setShowReplyForm(false);
  }, [comment.id, onReply]);

  const handleEditSubmit = useCallback((content: string) => {
    onEdit(comment.id, content);
    setIsEditing(false);
  }, [comment.id, onEdit]);

  return (
    <div className={`${level > 0 ? 'ml-10 pl-4 border-l-2 border-slate-100' : ''}`}>
      <div className="flex items-start gap-2 py-2 group">
        <div className="w-8 h-8 rounded-full bg-emerald-50 overflow-hidden shrink-0">
          <img
            src={comment.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${comment.userFullName}`}
            className="w-full h-full object-cover"
            alt={comment.userFullName}
          />
        </div>
        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="bg-slate-50 rounded-2xl px-3.5 py-2.5">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold text-slate-800">{comment.userFullName}</span>
              <span className="text-[9px] text-slate-400 font-medium">{formatTimeAgo(comment.timestamp)}</span>
              {comment.editedAt && (
                <span className="text-[8px] text-slate-300 font-medium">(đã sửa)</span>
              )}
            </div>
            {isEditing ? (
              <CommentForm
                currentUser={currentUser}
                users={users}
                initialValue={comment.content}
                onSubmit={handleEditSubmit}
                onCancel={() => setIsEditing(false)}
                autoFocus
              />
            ) : (
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                {renderContent(comment.content, comment.taggedUsers)}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-0.5 ml-2">
            <button
              onClick={() => onReact(comment.id)}
              className="text-[10px] font-bold text-slate-400 hover:text-emerald-500 transition-colors"
            >
              👍 {comment.reactions?.length > 0 ? comment.reactions.length : 'Thích'}
            </button>

            {level < maxNestingLevel && (
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-[10px] font-bold text-slate-400 hover:text-blue-500 transition-colors"
              >
                {showReplyForm ? 'Hủy' : 'Trả lời'}
              </button>
            )}

            {(isOwner || isAdmin) && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-bold text-slate-400 hover:text-amber-500 transition-colors"
                >
                  Sửa
                </button>
                <button
                  onClick={() => onDelete(comment.id)}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors"
                >
                  Xóa
                </button>
              </>
            )}
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <div className="mt-2">
              <CommentForm
                currentUser={currentUser}
                users={users}
                placeholder={`Trả lời ${comment.userFullName}...`}
                onSubmit={handleReplySubmit}
                autoFocus
                onCancel={() => setShowReplyForm(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

CommentItem.displayName = 'CommentItem';
export default CommentItem;