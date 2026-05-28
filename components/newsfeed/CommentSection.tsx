import React, { useState, useCallback, memo } from 'react';
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

  // Sort: gốc trước, replies sau
  const rootComments = localComments.filter(c => !c.parentId);
  const replies = localComments.filter(c => c.parentId);

  const getReplies = (parentId: string) => replies.filter(r => r.parentId === parentId);

  const handleAddComment = useCallback(async (content: string, taggedUsers: TaggedUser[]) => {
    setIsLoading(true);
    try {
      const newComment = await Database.addComment(postId, { content, taggedUsers });
      if (newComment) {
        const formatted: Comment = {
          id: newComment._id || newComment.id,
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

  // Currently handleAddComment doesn't pass parentId - let's fix this
  const handleReplyWithParent = useCallback(async (content: string, taggedUsers: TaggedUser[], parentId: string) => {
    setIsLoading(true);
    try {
      const newComment = await Database.addComment(postId, { content, taggedUsers, parentId });
      if (newComment) {
        const formatted: Comment = {
          id: newComment._id || newComment.id,
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

  const handleReact = useCallback(async (commentId: string) => {
    try {
      const result = await Database.reactToComment(postId, commentId, 'like');
      if (result) {
        setLocalComments(prev => prev.map(c =>
          c.id === commentId ? { ...c, reactions: result.reactions } : c
        ));
      }
    } catch (err: any) {
      console.error('[CommentSection] Error reacting:', err);
    }
  }, [postId]);

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
        {displayComments.map(comment => (
          <div key={comment.id}>
            <CommentItem
              comment={comment}
              currentUser={currentUser}
              users={users}
              postId={postId}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
              onReply={handleReplyWithParent}
              level={0}
            />
            {/* Render replies */}
            {getReplies(comment.id).map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUser={currentUser}
                users={users}
                postId={postId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onReact={handleReact}
                onReply={handleReplyWithParent}
                level={1}
              />
            ))}
          </div>
        ))}
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