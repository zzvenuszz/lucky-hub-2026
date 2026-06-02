import React, { useState, useCallback, useMemo, memo } from 'react';
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
  onReact: (commentId: string, type: string) => void;
  onReply: (content: string, taggedUsers: TaggedUser[], parentId: string) => void;
  level?: number;
}

const REACTION_ICONS: Record<string, string> = {
  like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡',
};

const REACTION_TYPES = [
  { type: 'like', icon: '👍' }, { type: 'love', icon: '❤️' }, { type: 'haha', icon: '😂' },
  { type: 'wow', icon: '😮' }, { type: 'sad', icon: '😢' }, { type: 'angry', icon: '😡' },
];

// Reaction Detail Modal for comment
const CommentReactionDetailModal: React.FC<{
  reactions: any[];
  currentUserId: string;
  onClose: () => void;
}> = memo(({ reactions, currentUserId, onClose }) => {
  // Expand reactions array: mỗi reaction với count > 1 được expand thành nhiều dòng
  const expanded: any[] = [];
  reactions.forEach((r: any) => {
    const count = r.count || 1;
    for (let i = 0; i < count; i++) {
      expanded.push(r);
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-black text-slate-800 text-sm">Chi tiết tương tác</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {expanded.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm font-medium">Chưa có tương tác nào</p>
          ) : (
            expanded.map((r, index) => (
              <div key={`${r.userId}-${r.type}-${index}`} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-50">
                    <img src={r.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${r.userName}`} className="w-full h-full object-cover" alt={r.userName} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{r.userName || 'Người dùng'}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">{REACTION_ICONS[r.type] || r.type}</p>
                  </div>
                </div>
                <span className="text-xl">{REACTION_ICONS[r.type] || '👍'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

CommentReactionDetailModal.displayName = 'CommentReactionDetailModal';

const CommentItem: React.FC<CommentItemProps> = memo(({
  comment, currentUser, users, postId, onEdit, onDelete, onReact, onReply, level = 0
}) => {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const commentId = comment.id || (comment as any)._id || '';
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const isOwner = comment.userId === currentUserId;
  const permissions: string[] = (currentUser as any).permissions || [];
  const isAdmin = permissions.includes('admin:panel');
  const isCoach = permissions.includes('coach:access');
  const isNddManager = permissions.includes('ndd:system');
  const canDelete = isOwner || isCoach || isNddManager || isAdmin;
  const canEdit = isOwner;
  const maxNestingLevel = 3;

  // Reactions data
  const reactions: any[] = (comment as any).reactions || [];
  const totalReacts = reactions.reduce((sum: number, r: any) => sum + (r.count || 1), 0);

  // Aggregate reaction counts by type
  const typeCounts: Record<string, number> = {};
  reactions.forEach((r: any) => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + (r.count || 1);
  });

  // Resolve thông tin user từ users[] prop để luôn lấy tên và avatar mới nhất
  const commentUser = useMemo(() => {
    return users.find(u => {
      const uid = (u as any).id || (u as any)._id;
      return uid === comment.userId;
    });
  }, [users, comment.userId]);

  // Dùng thông tin real-time nếu tìm thấy, fallback về snapshot cũ nếu không
  const displayName = commentUser?.fullName || comment.userFullName;
  const displayAvatar = commentUser?.avatar || comment.userAvatar;
  const avatarSeed = displayName || comment.userId;

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
    onReply(content, taggedUsers, commentId);
    setShowReplyForm(false);
  }, [commentId, onReply]);

  const handleEditSubmit = useCallback((content: string) => {
    onEdit(commentId, content);
    setIsEditing(false);
  }, [commentId, onEdit]);

  const handleReactClick = useCallback((type: string) => {
    onReact(commentId, type);
    setShowReactions(false);
  }, [commentId, onReact]);

  const userReactedTypes = useMemo(() => {
    return reactions.filter((r: any) => r.userId === currentUserId).map((r: any) => r.type);
  }, [reactions, currentUserId]);

  return (
    <div className={`${level > 0 ? 'ml-10 pl-4 border-l-2 border-slate-100' : ''}`}>
      <div className="flex items-start gap-2 py-2 group">
        <div className="w-8 h-8 rounded-full bg-emerald-50 overflow-hidden shrink-0">
          <img
            src={displayAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`}
            className="w-full h-full object-cover"
            alt={displayName}
          />
        </div>
        <div className="flex-1 min-w-0">
          {/* Comment bubble */}
          <div className="bg-slate-50 rounded-2xl px-3.5 py-2.5">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-bold text-slate-800">{displayName}</span>
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

          {/* Action buttons with reaction breakdown */}
          <div className="flex items-center gap-3 mt-0.5 ml-2">
            {/* Reaction Picker Trigger */}
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className={`text-[10px] font-bold transition-colors ${
                  userReactedTypes.length > 0
                    ? 'text-emerald-600'
                    : 'text-slate-400 hover:text-emerald-500'
                }`}
              >
                👍 {totalReacts > 0 ? 'Tương tác' : 'Thích'}
              </button>
              {showReactions && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-full shadow-2xl border border-slate-100 p-1 flex items-center gap-1 animate-in slide-in-from-bottom-2 z-10">
                  {REACTION_TYPES.map(react => (
                    <button
                      key={react.type}
                      onClick={() => handleReactClick(react.type)}
                      className={`w-8 h-8 flex items-center justify-center text-base hover:scale-125 transition-all rounded-full ${
                        userReactedTypes.includes(react.type) ? 'scale-110 ring-2 ring-emerald-300' : ''
                      }`}
                      title={react.type}
                    >
                      {react.icon}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {level < maxNestingLevel && (
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-[10px] font-bold text-slate-400 hover:text-blue-500 transition-colors"
              >
                {showReplyForm ? 'Hủy' : 'Trả lời'}
              </button>
            )}

            {(canEdit || canDelete) && !isEditing && (
              <>
                {canEdit && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-[10px] font-bold text-slate-400 hover:text-amber-500 transition-colors"
                  >
                    Sửa
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => onDelete(commentId)}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    Xóa
                  </button>
                )}
              </>
            )}
          </div>

          {/* Reaction Breakdown Bar */}
          {totalReacts > 0 && (
            <div className="flex items-center gap-2 mt-1 ml-2">
              <button
                onClick={() => setShowDetailModal(true)}
                className="flex items-center gap-1.5 hover:bg-slate-50 px-2 py-0.5 rounded-xl transition-all"
                title="Xem chi tiết tương tác"
              >
                <div className="flex items-center gap-1">
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <span key={type} className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500">
                      {REACTION_ICONS[type] || '👍'}
                      <span className="text-[9px]">{count}</span>
                    </span>
                  ))}
                </div>
              </button>
            </div>
          )}

          {/* Reply Form */}
          {showReplyForm && (
            <div className="mt-2">
              <CommentForm
                currentUser={currentUser}
                users={users}
                placeholder={`Trả lời ${displayName}...`}
                onSubmit={handleReplySubmit}
                autoFocus
                onCancel={() => setShowReplyForm(false)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Reaction Detail Modal */}
      {showDetailModal && (
        <CommentReactionDetailModal
          reactions={reactions}
          currentUserId={currentUserId}
          onClose={() => setShowDetailModal(false)}
        />
      )}
    </div>
  );
});

CommentItem.displayName = 'CommentItem';
export default CommentItem;