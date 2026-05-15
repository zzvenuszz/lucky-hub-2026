import React, { memo, useState, useCallback } from 'react';
import { Post, User, UserRole } from '../../types.ts';
import BadgeDisplay from '../system/BadgeDisplay.tsx';
import { formatTimeAgo } from '../../utils/formatters.ts';

interface PostItemProps {
  post: Post;
  currentUser: User;
  onEdit: (post: Post) => void;
  onDelete: (id: string) => void;
  onReact: (postId: string, type: string) => void;
  onRemoveReact?: (postId: string, type: string) => void;
  showReactions: string | null;
  setShowReactions: (id: string | null) => void;
  reactionTypes: any[];
  onHashtagClick?: (hashtag: string) => void;
}

interface ReactionDetail {
  userId: string;
  userName?: string;
  userAvatar?: string;
  type: string;
  count: number;
}

const ImageGrid: React.FC<{ images: string[] }> = ({ images }) => {
  if (!images || images.length === 0) return null;
  const count = images.length;
  if (count === 1) return <div className="rounded-[2rem] overflow-hidden border border-slate-50"><img src={images[0]} className="w-full h-auto object-cover max-h-[600px]" alt="Post" /></div>;
  return (
    <div className={`grid ${count === 2 ? 'grid-cols-2' : 'grid-cols-2'} gap-1 rounded-[2rem] overflow-hidden`}>
      {images.slice(0, 4).map((img, i) => <img key={i} src={img} className="w-full h-48 object-cover" alt="Post" />)}
    </div>
  );
};

const REACTION_ICONS: Record<string, string> = {
  like: '👍',
  love: '❤️',
  haha: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

// Reaction Breakdown Bar Component
const ReactionBreakdown: React.FC<{
  reactions: ReactionDetail[];
  onBreakdownClick: () => void;
}> = memo(({ reactions, onBreakdownClick }) => {
  // Aggregate reactions by type
  const typeCounts: Record<string, number> = {};
  reactions.forEach(r => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + r.count;
  });

  return (
    <div className="flex items-center gap-2">
      {Object.entries(typeCounts).map(([type, count]) => (
        <span key={type} className="flex items-center gap-1 text-xs font-semibold text-slate-500">
          {REACTION_ICONS[type] || '👍'} {count}
        </span>
      ))}
    </div>
  );
});

ReactionBreakdown.displayName = 'ReactionBreakdown';

// Reaction Detail Modal
const ReactionDetailModal: React.FC<{
  reactions: ReactionDetail[];
  currentUserId: string;
  onClose: () => void;
  onRemoveReact?: (type: string) => void;
}> = memo(({ reactions, currentUserId, onClose, onRemoveReact }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-black text-slate-800 text-sm">Chi tiết tương tác</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">✕</button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {reactions.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm font-medium">Chưa có tương tác nào</p>
          ) : (
            reactions.map((r, index) => {
              const isOwn = r.userId === currentUserId;
              return (
                <div key={`${r.userId}-${r.type}-${index}`} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-emerald-50">
                      <img src={r.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${r.userName}`} className="w-full h-full object-cover" alt={r.userName} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">{r.userName || 'Người dùng'}</p>
                      <p className="text-[10px] text-slate-400 font-semibold">
                        {REACTION_ICONS[r.type] || r.type} × {r.count} lần
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{REACTION_ICONS[r.type] || '👍'}</span>
                    {isOwn && onRemoveReact && (
                      <button
                        onClick={() => onRemoveReact(r.type)}
                        className="text-[10px] font-bold text-rose-400 hover:text-rose-600 bg-white px-3 py-1.5 rounded-full border border-rose-100 hover:border-rose-300 transition-all"
                        title="Gỡ tương tác"
                      >
                        Gỡ
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});

ReactionDetailModal.displayName = 'ReactionDetailModal';

// Parse content to render hashtags as clickable blue links
const renderContentWithHashtags = (content: string, onHashtagClick?: (hashtag: string) => void) => {
  if (!content) return null;
  
  // Regex to match hashtags like #word or #word_with_underscores
  const hashtagRegex = /(#[\w\u00C0-\u024F]+)/g;
  const parts = content.split(hashtagRegex);
  
  return parts.map((part, index) => {
    if (part.startsWith('#') && part.length > 1) {
      return onHashtagClick ? (
        <button
          key={index}
          onClick={(e) => {
            e.preventDefault();
            onHashtagClick(part);
          }}
          className="text-blue-500 hover:text-blue-700 font-bold cursor-pointer inline"
        >
          {part}
        </button>
      ) : (
        <span key={index} className="text-blue-500 font-bold">{part}</span>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

const PostItem: React.FC<PostItemProps> = ({ 
  post, currentUser, onEdit, onDelete, onReact, onRemoveReact,
  showReactions, setShowReactions, reactionTypes, onHashtagClick 
}) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const postId = post.id || (post as any)._id;
  const isOwner = currentUserId === post.userId;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const reactions: ReactionDetail[] = post.reactions || [];
  const totalReacts = reactions.reduce((sum, curr) => sum + curr.count, 0) || 0;

  const handleRemoveOwnReaction = useCallback((type: string) => {
    if (onRemoveReact) {
      onRemoveReact(postId, type);
      setShowDetailModal(false);
    }
  }, [onRemoveReact, postId]);

  // Aggregate reaction counts by type for breakdown display
  const typeCounts: Record<string, number> = {};
  reactions.forEach(r => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + r.count;
  });

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-all">
      <div className="p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
          <img src={post.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.userFullName}`} className="w-full h-full object-cover" alt={post.userFullName} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-black text-slate-800 text-sm truncate">{post.userFullName}</span>
            <BadgeDisplay badgeIds={post.userBadges} isCommunity={true} />
          </div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{formatTimeAgo(post.timestamp)}</div>
        </div>
        <div className="flex items-center gap-2">
          {(isOwner || isAdmin) && <button onClick={() => onEdit(post)} className="text-slate-300 hover:text-emerald-500 p-2">✏️</button>}
          {(isOwner || isAdmin) && <button onClick={() => onDelete(postId)} className="text-slate-300 hover:text-rose-500 p-2">🗑️</button>}
        </div>
      </div>
      
      <div className="px-5 pb-3 space-y-4">
        {/* Content with hashtag highlighting */}
        <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">
          {renderContentWithHashtags(post.content, onHashtagClick)}
        </p>
        
        {/* Hashtag chips */}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.hashtags.map((tag, i) => (
              onHashtagClick ? (
                <button
                  key={i}
                  onClick={() => onHashtagClick(tag)}
                  className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold hover:bg-blue-100 transition-colors"
                >
                  {tag}
                </button>
              ) : (
                <span key={i} className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
                  {tag}
                </span>
              )
            ))}
          </div>
        )}

        <ImageGrid images={post.imageUrls || []} />
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center justify-between border-t border-slate-50 pt-3">
          <div className="relative">
            <button 
              onClick={() => setShowReactions(showReactions === postId ? null : postId)}
              className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-600 transition-all"
            >
              👍 Tương tác
            </button>
            {showReactions === postId && (
              <div className="absolute bottom-full left-0 mb-2 bg-white rounded-full shadow-2xl border border-slate-100 p-1 flex items-center gap-1 animate-in slide-in-from-bottom-2 z-10">
                {reactionTypes.map(react => (
                  <button 
                    key={react.type} 
                    onClick={() => onReact(postId, react.type)} 
                    className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-all rounded-full"
                    title={react.type}
                  >
                    {react.icon}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Reaction Breakdown - Right Side */}
          {totalReacts > 0 && (
            <button 
              onClick={() => setShowDetailModal(true)}
              className="flex items-center gap-1.5 hover:bg-slate-50 px-2 py-1 rounded-xl transition-all"
              title="Xem chi tiết tương tác"
            >
              <div className="flex items-center gap-1">
                {Object.entries(typeCounts).map(([type, count]) => (
                  <span key={type} className="flex items-center gap-0.5 text-xs font-bold text-slate-500">
                    {REACTION_ICONS[type] || '👍'} 
                    <span className="text-[10px]">{count}</span>
                  </span>
                ))}
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{totalReacts} tương tác</span>
            </button>
          )}
        </div>
      </div>

      {/* Reaction Detail Modal */}
      {showDetailModal && (
        <ReactionDetailModal 
          reactions={reactions}
          currentUserId={currentUserId}
          onClose={() => setShowDetailModal(false)}
          onRemoveReact={handleRemoveOwnReaction}
        />
      )}
    </div>
  );
};

export default memo(PostItem);