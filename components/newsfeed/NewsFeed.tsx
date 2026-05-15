import React, { useState, useEffect, useCallback, memo } from 'react';
import { User, Post, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { cacheManager } from '../../utils/cacheManager.ts';
import { compressImage } from '../../utils/imageUtils.ts';
import PostCreator from './PostCreator.tsx';
import PostItem from './PostItem.tsx';
import PostEditor from './PostEditor.tsx';

interface NewsFeedProps {
  currentUser: User;
}

const REACTION_TYPES = [
  { type: 'like', icon: '👍' }, { type: 'love', icon: '❤️' }, { type: 'haha', icon: '😂' }, 
  { type: 'wow', icon: '😮' }, { type: 'sad', icon: '😢' }, { type: 'angry', icon: '😡' },
];

const NewsFeed: React.FC<NewsFeedProps> = memo(({ currentUser }) => {
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

  const fetchPosts = useCallback(async () => {
    try {
      console.log(`[NewsFeed] Fetching posts for user: ${currentUserId}`);
      
      // Check cache first
      const cachedPosts = cacheManager.get<Post[]>('posts');
      if (cachedPosts && !activeHashtag) {
        console.log(`[NewsFeed] Using cached posts: ${cachedPosts.length} posts`);
        setPosts(cachedPosts);
        return;
      }

      const data = await Database.getPosts();
      if (data) {
        cacheManager.set('posts', data, 3); // Cache for 3 minutes
        setPosts(data);
        // Also fetch hashtags
        fetchHashtags();
        console.log(`[NewsFeed] Successfully loaded ${data.length} posts`);
      }
    } catch (error) {
      console.error(`[NewsFeed] Error fetching posts:`, error);
      // Graceful fallback - maintain existing posts
    }
  }, [currentUserId, activeHashtag, fetchHashtags]);

  useEffect(() => { fetchPosts(); const interval = setInterval(fetchPosts, 120000); return () => clearInterval(interval); }, [fetchPosts]);

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
        const reactionLabel = REACTION_TYPES.find(r => r.type === type)?.label || type;
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
      await Database.deletePost(postId); 
      cacheManager.remove('posts');
      fetchPosts(); 
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
        {filteredPosts.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-10 text-center">
            <p className="text-slate-400 font-bold text-sm">
              {activeHashtag 
                ? `Chưa có bài viết nào với hashtag ${activeHashtag}`
                : 'Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ!'}
            </p>
          </div>
        ) : (
          filteredPosts.map(post => (
            <PostItem 
              key={post.id || (post as any)._id} post={post} currentUser={currentUser} 
              onEdit={handleEditPost} onDelete={handleDeletePost} onReact={handleReaction} 
              onRemoveReact={handleRemoveReaction}
              showReactions={showReactionsFor} setShowReactions={setShowReactionsFor} 
              reactionTypes={REACTION_TYPES}
              onHashtagClick={handleHashtagClick}
            />
          ))
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