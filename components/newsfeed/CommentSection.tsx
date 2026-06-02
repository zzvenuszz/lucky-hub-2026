import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Comment, User, TaggedUser } from '../../types.ts';
import { Database } from '../../services/database.ts';
import CommentItem from './CommentItem.tsx';
import CommentForm from './CommentForm.tsx';

interface CommentSectionProps {
  postId: string;
  comments: Comment[];
  commentCount: number;
  currentUser: User;
  users: User[];
  onCommentCountChange?: (delta: number) => void;
}

const CommentSection: React.FC<CommentSectionProps> = memo(({
  postId, comments = [], commentCount = 0, currentUser, users, onCommentCountChange
}) => {
  const [localComments, setLocalComments] = useState<Comment[]>(comments);
  const [showAll, setShowAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Track latest comments from props để merge khi PostDetail fetch lại
  const commentsRef = useRef(comments);

  // Merge comments từ props vào localComments - thêm những comment mới từ DB, giữ local state
  useEffect(() => {
    const prevIds = new Set(commentsRef.current.map((c: any) => c.id || c._id));
    const newFromDb = comments.filter((c: any) => !prevIds.has(c.id || c._id));
    if (newFromDb.length > 0) {
      setLocalComments(prev => {
        const existingIds = new Set(prev.map((c: any) => c.id || c._id));
        const reallyNew = newFromDb.filter((c: any) => !existingIds.has(c.id || c._id));
        return reallyNew.length > 0 ? [...prev, ...reallyNew] : prev;
      });
    }
    commentsRef.current = comments;
  }, [comments]);

  // Sort: gốc trước (mới nhất lên trên), replies sau (cũ nhất lên trên)
  const sortedLocal = [...localComments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const rootComments = sortedLocal.filter(c => !c.parentId);
  const replies = sortedLocal.filter(c => c.parentId);

  const getReplies = (parentId: string) => replies.filter(r => r.parentId === parentId);

  const handleAddComment = useCallback(async (content: string, taggedUsers: TaggedUser[]) => {
    setIsLoading(true);
    try {
      const newComment = await Database.addComment(postId, { content, taggedUsers });
      if (newComment) {
        const formatted: Comment = {
          id: (newComment._id || newComment.id || '').toString(),
          postId,
          userId: newComment.userId,
          userFullName: newComment.userFullName,
          userAvatar: newComment.userAvatar || '',
          content: newComment.content,
          timestamp: newComment.timestamp,
          parentId: newComment.parentId || null,
          taggedUsers: newComment.taggedUsers || [],
          reactions: newComment.reactions || [],
        };
        setLocalComments(prev => [...prev, formatted]);
        onCommentCountChange?.(1);
        console.log(`[CommentSection] Comment added to post ${postId}`);
      }
    } catch (err: any) {
      console.error('[CommentSection] Error adding comment:', err);
    } finally {
      setIsLoading(false);
    }
  }, [postId, onCommentCountChange]);

  const handleReply = useCallback(async (content: string, taggedUsers: TaggedUser[], parentId: string) => {
    await handleAddComment(content, [...taggedUsers, ...(taggedUsers || [])]);
  }, [handleAddComment]);

  const handleReplyWithParent = useCallback(async (content: string, taggedUsers: TaggedUser[], parentId: string) => {
    setIsLoading(true);
    try {
      const newComment = await Database.addComment(postId, { content, taggedUsers, parentId });
      if (newComment) {
        const formatted: Comment = {
          id: (newComment._id || newComment.id || '').toString(),
          postId,
          userId: newComment.userId,
          userFullName: newComment.userFullName,
          userAvatar: newComment.userAvatar || '',
          content: newComment.content,
          timestamp: newComment.timestamp,
          parentId: parentId,
          taggedUsers: newComment.taggedUsers || [],
          reactions: newComment.reactions || [],
        };
        setLocalComments(prev => [...prev, formatted]);
        onCommentCountChange?.(1);
      }
    } catch (err: any) {
      console.error('[CommentSection] Error replying:', err);
    } finally {
      setIsLoading(false);
    }
  }, [postId, onCommentCountChange]);

  const handleEdit = useCallback(async (commentId: string, content: string) => {
    try {
      const updated = await Database.editComment(postId, commentId, content);
      if (updated) {
        setLocalComments(prev => prev.map(c =>
          c.id === commentId ? { ...c, content, editedAt: new Date().toISOString() } : c
        ));
      }
    } catch (err: any) {
      console.error('[CommentSection] Error editing comment:', err);
    }
  }, [postId]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (!confirm('Xóa bình luận này?')) return;
    try {
      await Database.deleteComment(postId, commentId);
      setLocalComments(prev => {
        // Xóa comment và tất cả replies của nó
        const toDelete = new Set([commentId]);
        prev.filter(c => c.parentId === commentId).forEach(c => toDelete.add(c.id));
        return prev.filter(c => !toDelete.has(c.id));
      });
      onCommentCountChange?.(-1);
    } catch (err: any) {
      console.error('[CommentSection] Error deleting comment:', err);
    }
  }, [postId, onCommentCountChange]);

  const handleReact = useCallback(async (commentId: string, type: string) => {
    try {
      const result = await Database.reactToComment(postId, commentId, type, currentUser.fullName, currentUser.avatar);
      if (result) {
        setLocalComments(prev => prev.map(c =>
          c.id === commentId ? { ...c, reactions: result.reactions } : c
        ));
      }
    } catch (err: any) {
      console.error('[CommentSection] Error reacting:', err);
    }
  }, [postId, currentUser.fullName, currentUser.avatar]);

  const displayComments = showAll ? rootComments : rootComments.slice(0, 3);
  const hasMoreComments = rootComments.length > 3 && !showAll;
  const totalReplies = replies.length;

  return (
    <div className="space-y-3 animate-in fade-in">
      {/* Comment Form */}
      <CommentForm
        currentUser={currentUser}
        users={users}
        placeholder="Viết bình luận..."
        onSubmit={handleAddComment}
      />

      {/* Comments List */}
      <div className="space-y-1">
          {displayComments.map(c => {
          const commentId = String(c.id || (c as any)._id || '');
          return (
            <div key={commentId}>
              <CommentItem
                comment={c}
                currentUser={currentUser}
                users={users}
                postId={postId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReact={(id: string, type: string) => handleReact(id || commentId, type)}
                onReply={(content: string, taggedUsers: TaggedUser[]) => handleReplyWithParent(content, taggedUsers, commentId)}
                level={0}
              />
              {/* Render replies */}
              {getReplies(commentId).map(r => {
                const replyId = String(r.id || (r as any)._id || '');
                return (
                  <CommentItem
                    key={replyId}
                    comment={r}
                    currentUser={currentUser}
                    users={users}
                    postId={postId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onReact={handleReact}
                    onReply={(content: string, taggedUsers: TaggedUser[]) => handleReplyWithParent(content, taggedUsers, replyId)}
                    level={1}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Show more button */}
      {hasMoreComments && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          Xem thêm {rootComments.length - 3} bình luận
        </button>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="text-center py-2">
          <span className="inline-block w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {rootComments.length === 0 && !isLoading && (
        <p className="text-[10px] text-slate-400 text-center py-2 font-medium">
          Chưa có bình luận nào. Hãy là người đầu tiên!
        </p>
      )}
    </div>
  );
});

CommentSection.displayName = 'CommentSection';
export default CommentSection;