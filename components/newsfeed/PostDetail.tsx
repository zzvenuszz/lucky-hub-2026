import React, { useState, useEffect, useCallback, memo } from 'react';
import { Post, User, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { formatTimeAgo } from '../../utils/formatters.ts';
import BadgeDisplay from '../system/BadgeDisplay.tsx';
import CommentSection from './CommentSection.tsx';

interface PostDetailProps {
  postId: string;
  currentUser: User;
  users: User[];
  onClose: () => void;
  onPostUpdated?: (post: Post) => void;
}

const REACTION_ICONS: Record<string, string> = {
  like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', angry: '😡',
};

const PostDetail: React.FC<PostDetailProps> = memo(({ postId, currentUser, users, onClose, onPostUpdated }) => {
  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPost = useCallback(async () => {
    try {
      const resp = await fetch(`/api/posts/${postId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('lucky_hub_session')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setPost({ ...data, id: data.id || data._id });
      }
    } catch (err: any) {
      console.error('[PostDetail] Error fetching post:', err);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const handleCommentCountChange = useCallback((delta: number) => {
    if (post) {
      const updated = { ...post, commentCount: (post.commentCount || 0) + delta };
      setPost(updated);
      onPostUpdated?.(updated);
    }
  }, [post, onPostUpdated]);

  const handleReact = useCallback(async () => {
    if (!post) return;
    const currentUserId = (currentUser as any).id || (currentUser as any)._id;
    const updatedPost = await Database.reactToPost(postId, currentUserId, 'like', currentUser.fullName, currentUser.avatar);
    if (updatedPost) {
      setPost({ ...updatedPost, id: updatedPost.id || (updatedPost as any)._id });
    }
  }, [post, postId, currentUser]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10" onClick={e => e.stopPropagation()}>
          <span className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40" onClick={onClose}>
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10" onClick={e => e.stopPropagation()}>
          <p className="text-slate-400 font-bold text-sm">Không tìm thấy bài viết</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold">Đóng</button>
        </div>
      </div>
    );
  }

  const currentUserId = (currentUser as any).id || (currentUser as any)._id;
  const reactions = post.reactions || [];
  const totalReacts = reactions.reduce((sum, r) => sum + (r.count || 1), 0);

  const typeCounts: Record<string, number> = {};
  reactions.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + (r.count || 1); });

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <h3 className="font-black text-slate-800 text-sm">Bài viết</h3>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all">✕</button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {/* Author info */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
              <img src={post.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.userFullName}`} className="w-full h-full object-cover" alt="" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800 text-sm">{post.userFullName}</span>
                <BadgeDisplay badgeIds={post.userBadges} isCommunity={true} />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {formatTimeAgo(post.timestamp)}
              </p>
            </div>
          </div>

          {/* Content */}
          <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{post.content}</p>

          {/* Images */}
          {post.imageUrls && post.imageUrls.length > 0 && (
            <div className="rounded-[2rem] overflow-hidden border border-slate-50">
              {post.imageUrls.length === 1 ? (
                <img src={post.imageUrls[0]} className="w-full h-auto max-h-[500px] object-cover" alt="" />
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {post.imageUrls.slice(0, 4).map((img, i) => (
                    <img key={i} src={img} className="w-full h-48 object-cover" alt="" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hashtags */}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.hashtags.map((tag, i) => (
                <span key={i} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">{tag}</span>
              ))}
            </div>
          )}

          {/* Reactions & Comment count */}
          <div className="flex items-center justify-between py-3 border-t border-slate-50">
            <div className="flex items-center gap-2">
              {Object.entries(typeCounts).slice(0, 3).map(([type, count]) => (
                <span key={type} className="text-xs font-bold text-slate-500">
                  {REACTION_ICONS[type] || '👍'} {count}
                </span>
              ))}
              {totalReacts > 0 && <span className="text-[10px] text-slate-400 font-bold">{totalReacts} tương tác</span>}
            </div>
            <span className="text-[10px] text-slate-400 font-bold">{post.commentCount || 0} bình luận</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-4 border-t border-b border-slate-50 py-2">
            <button
              onClick={handleReact}
              className="flex-1 py-2 text-xs font-bold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            >
              👍 Thích
            </button>
            <button className="flex-1 py-2 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
              💬 Bình luận
            </button>
          </div>

          {/* Comment Section */}
          <CommentSection
            postId={postId}
            comments={post.comments || []}
            commentCount={post.commentCount || 0}
            currentUser={currentUser}
            users={users}
            onCommentCountChange={handleCommentCountChange}
          />
        </div>
      </div>
    </div>
  );
});

PostDetail.displayName = 'PostDetail';
export default PostDetail;