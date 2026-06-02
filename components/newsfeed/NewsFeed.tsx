import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { User, Post } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { cacheManager } from '../../utils/cacheManager.ts';
import { compressImage } from '../../utils/imageUtils.ts';
import PostCreator from './PostCreator.tsx';
import PostItem from './PostItem.tsx';
import PostEditor from './PostEditor.tsx';
import PostDetail from './PostDetail.tsx';

interface NewsFeedProps {
  currentUser: User;
  users?: User[];
}

const REACTION_TYPES = [
  { type: 'like', icon: '👍' }, { type: 'love', icon: '❤️' }, { type: 'haha', icon: '😂' }, 
  { type: 'wow', icon: '😮' }, { type: 'sad', icon: '😢' }, { type: 'angry', icon: '😡' },
];

const PER_PAGE = 10;

const NewsFeed: React.FC<NewsFeedProps> = memo(({ currentUser, users = [] }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [popularHashtags, setPopularHashtags] = useState<string[]>([]);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalPosts, setTotalPosts] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  // Fetch popular hashtags
  const fetchHashtags = useCallback(async () => {
    try {
      const data = await Database.getPopularHashtags();
      if (data) {
        setPopularHashtags(data.map((h: any) => h.tag));
      }
    } catch (error) {
      console.error(`[NewsFeed] Error fetching hashtags:`, error);
    }
  }, []);

  // Load posts with pagination - reset when hashtag changes
  const loadPosts = useCallback(async (pageNum: number, append: boolean, searchHashtag: string) => {
    if (pageNum === 1 && !append) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      console.log(`[NewsFeed] Fetching page ${pageNum}${searchHashtag ? ` with hashtag: ${searchHashtag}` : ''}`);
      const result = await Database.getPostsPaginated(pageNum, PER_PAGE, '', searchHashtag);
      if (result) {
        if (append) {
          setPosts(prev => [...prev, ...result.posts]);
        } else {
          setPosts(result.posts);
        }
        setTotalPosts(result.pagination.total);
        setHasMore(result.pagination.hasMore);
        console.log(`[NewsFeed] Loaded page ${pageNum}/${result.pagination.totalPages} (${result.posts.length} posts, total: ${result.pagination.total})`);

        // Load hashtags on first page load
        if (pageNum === 1) {
          fetchHashtags();
        }
      }
    } catch (error) {
      console.error(`[NewsFeed] Error fetching posts:`, error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [fetchHashtags]);

  // Initial load + reload when hashtag changes
  useEffect(() => {
    setPage(1);
    setPosts([]);
    setHasMore(true);
    loadPosts(1, false, activeHashtag || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHashtag]);

  // Setup IntersectionObserver for infinite scroll using callback ref
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPosts(nextPage, true, activeHashtag || '');
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    observerRef.current = observer;
  }, [hasMore, isLoadingMore, page, activeHashtag, loadPosts]);

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Refresh posts periodically (mỗi 2 phút, không reset page)
  useEffect(() => {
    const interval = setInterval(() => {
      loadPosts(1, false, activeHashtag || '');
    }, 120000);
    return () => clearInterval(interval);
  }, [activeHashtag, loadPosts]);

  // Filter posts by active hashtag
  const filteredPosts = activeHashtag
    ? posts.filter(p => p.hashtags?.includes(activeHashtag))
    : posts;

  const handleCreatePost = async () => {
    if (!inputText.trim() && selectedImages.length === 0) return;
    setIsLoading(true); 
    setIsProcessingImages(true);
    
    try {
      console.log(`[NewsFeed] Creating post with ${selectedImages.length} images, hashtags: ${JSON.stringify(hashtags)}`);
      const compressedImages = await Promise.all(selectedImages.map(img => compressImage(img)));
      const newPost = { 
        userId: currentUserId, 
        userFullName: currentUser.fullName, 
        userAvatar: currentUser.avatar, 
        userBadges: currentUser.badges || [], 
        content: inputText, 
        imageUrls: compressedImages, 
        hashtags,
        timestamp: new Date().toISOString(), 
        reactions: [] 
      };
      const saved = await Database.createPost(newPost as any);
      if (saved) { 
        setPosts([saved, ...posts]); 
        setInputText(''); 
        setSelectedImages([]);
        setHashtags([]);
        // Refresh hashtag suggestions
        fetchHashtags();
        console.log(`[NewsFeed] Post created successfully`);
      }
    } catch (error) {
      console.error(`[NewsFeed] Error creating post:`, error);
      // Show error state to user
    } finally {
      setIsLoading(false); 
      setIsProcessingImages(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: any) => {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handleEditPost = useCallback((post: Post) => {
    console.log(`[NewsFeed] Opening editor for post: ${post.id || (post as any)._id}`);
    setEditingPost(post);
  }, []);

  const handleSaveEdit = useCallback((updatedPost: Post) => {
    console.log(`[NewsFeed] Post updated, refreshing list`);
    setPosts(prev => prev.map(p => 
      (p.id || (p as any)._id) === (updatedPost.id || (updatedPost as any)._id) ? updatedPost : p
    ));
    // Clear cache to force fresh data on reload
    cacheManager.remove('posts');
    fetchHashtags();
  }, [fetchHashtags]);

  const handleReaction = async (postId: string, type: string) => {
    console.log(`[NewsFeed] Reacting: user=${currentUserId}, post=${postId}, type=${type}`);
    const updatedPost = await Database.reactToPost(postId, currentUserId, type, currentUser.fullName, currentUser.avatar);
    if (updatedPost) {
      setPosts(prev => {
        const newPosts = prev.map(p => (p.id || (p as any)._id) === (updatedPost.id || (updatedPost as any)._id) ? { ...updatedPost, id: updatedPost.id || (updatedPost as any)._id } : p);
        // Clear cache to force fresh data on reload
        cacheManager.remove('posts');
        return newPosts;
      });
      if (window.debugLog) {
        const reactionLabel = REACTION_TYPES.find(r => r.type === type)?.icon || type;
        window.debugLog(`Người dùng @${currentUser.username} đã bày tỏ cảm xúc ${reactionLabel} với một bài viết`, "user");
      }
    }
    setShowReactionsFor(null);
  };

  const handleRemoveReaction = async (postId: string, type: string) => {
    console.log(`[NewsFeed] Removing reaction: user=${currentUserId}, post=${postId}, type=${type}`);
    const updatedPost = await Database.removeReaction(postId, currentUserId, type);
    if (updatedPost) {
      setPosts(prev => {
        const newPosts = prev.map(p => (p.id || (p as any)._id) === (updatedPost.id || (updatedPost as any)._id) ? { ...updatedPost, id: updatedPost.id || (updatedPost as any)._id } : p);
        // Clear cache to force fresh data on reload
        cacheManager.remove('posts');
        return newPosts;
      });
      console.log(`[NewsFeed] Successfully removed reaction: user=${currentUserId}, post=${postId}, type=${type}`);
    } else {
      console.error(`[NewsFeed] Failed to remove reaction: user=${currentUserId}, post=${postId}, type=${type}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (confirm("Xóa bài viết này?")) { 
      const success = await Database.deletePost(postId); 
      if (success !== null) {
        setPosts(prev => prev.filter(p => (p.id || (p as any)._id) !== postId));
        cacheManager.remove('posts');
        console.log(`[NewsFeed] Post ${postId} deleted successfully`);
      }
    }
  };

  const handleHashtagClick = useCallback((hashtag: string) => {
    console.log(`[NewsFeed] Filtering by hashtag: ${hashtag}`);
    setActiveHashtag(prev => prev === hashtag ? null : hashtag);
  }, []);

  // Collect all unique hashtags from posts
  const allHashtags = Array.from(
    new Set(posts.flatMap(p => p.hashtags || []))
  ).sort();

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <PostCreator 
        currentUser={currentUser} inputText={inputText} setInputText={setInputText} 
        selectedImages={selectedImages} setSelectedImages={setSelectedImages} 
        isProcessingImages={isProcessingImages} isLoading={isLoading} 
        onCreate={handleCreatePost} onImageChange={handleImageChange} 
        popularHashtags={popularHashtags}
        hashtags={hashtags} setHashtags={setHashtags}
      />

      {/* Hashtag Cloud Filter */}
      {allHashtags.length > 0 && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveHashtag(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                !activeHashtag 
                  ? 'bg-emerald-500 text-white shadow-sm' 
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              Tất cả
            </button>
            {allHashtags.map(tag => (
              <button
                key={tag}
                onClick={() => handleHashtagClick(tag)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeHashtag === tag
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {activeHashtag && (
            <p className="text-[10px] text-slate-400 font-bold mt-2">
              Đang xem bài viết với hashtag <span className="text-blue-600">{activeHashtag}</span>
              {' '}({filteredPosts.length} bài viết)
            </p>
          )}
        </div>
      )}

      <div className="space-y-6">
        {posts.length === 0 && !isLoading ? (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-10 text-center">
            <p className="text-slate-400 font-bold text-sm">
              {activeHashtag 
                ? `Chưa có bài viết nào với hashtag ${activeHashtag}`
                : 'Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ!'}
            </p>
          </div>
        ) : (
          <>
            {posts.map(post => (
              <PostItem 
                key={post.id || (post as any)._id} post={post} currentUser={currentUser} 
                onEdit={handleEditPost} onDelete={handleDeletePost} onReact={handleReaction} 
                onRemoveReact={handleRemoveReaction}
                showReactions={showReactionsFor} setShowReactions={setShowReactionsFor} 
                reactionTypes={REACTION_TYPES}
                onHashtagClick={handleHashtagClick}
                users={users}
              />
            ))}
            {/* Infinite scroll sentinel - dùng callback ref để observer hoạt động */}
            <div ref={sentinelCallbackRef} className="h-4" />
            {isLoadingMore && (
              <div className="text-center py-4">
                <div className="inline-block w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-bold mt-2">Đang tải thêm...</p>
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <div className="text-center py-6">
                <p className="text-xs text-slate-400 font-bold">Đã hiển thị tất cả {totalPosts} bài viết</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Post Editor Modal */}
      {editingPost && (
        <PostEditor 
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handleSaveEdit}
          popularHashtags={popularHashtags}
        />
      )}
    </div>
  );
});

NewsFeed.displayName = 'NewsFeed';

export default NewsFeed;