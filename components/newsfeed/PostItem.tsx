
import React, { memo } from 'react';
import { Post, User, UserRole } from '../../types.ts';
import BadgeDisplay from '../system/BadgeDisplay.tsx';
import { formatTimeAgo } from '../../utils/formatters.ts';

interface PostItemProps {
  post: Post;
  currentUser: User;
  onEdit: (post: Post) => void;
  onDelete: (id: string) => void;
  onReact: (postId: string, type: string) => void;
  showReactions: string | null;
  setShowReactions: (id: string | null) => void;
  reactionTypes: any[];
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

const PostItem: React.FC<PostItemProps> = ({ 
  post, currentUser, onEdit, onDelete, onReact, 
  showReactions, setShowReactions, reactionTypes 
}) => {
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const postId = post.id || (post as any)._id;
  const isOwner = currentUserId === post.userId;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const totalReacts = post.reactions?.reduce((sum, curr) => sum + curr.count, 0) || 0;

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
        <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{post.content}</p>
        <ImageGrid images={post.imageUrls || []} />
      </div>

      <div className="px-5 pb-4">
        <div className="flex items-center justify-between border-t border-slate-50 pt-3 relative">
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
                  <button key={react.type} onClick={() => onReact(postId, react.type)} className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-all rounded-full">{react.icon}</button>
                ))}
              </div>
            )}
          </div>
          {totalReacts > 0 && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{totalReacts} tương tác</span>}
        </div>
      </div>
    </div>
  );
};

export default memo(PostItem);
