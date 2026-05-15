
import React, { useState, useEffect, useCallback, memo } from 'react';
import { User, Post, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import { cacheManager } from '../../utils/cacheManager.ts';
import { compressImage } from '../../utils/imageUtils.ts';
import PostCreator from './PostCreator.tsx';
import PostItem from './PostItem.tsx';

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
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  const fetchPosts = useCallback(async () => {
    try {
      console.log(`[NewsFeed] Fetching posts for user: ${currentUserId}`);
      
      // Check cache first
      const cachedPosts = cacheManager.get<Post[]>('posts');
      if (cachedPosts) {
        console.log(`[NewsFeed] Using cached posts: ${cachedPosts.length} posts`);
        setPosts(cachedPosts);
        return;
      }

      const data = await Database.getPosts();
      if (data) {
        cacheManager.set('posts', data, 3); // Cache for 3 minutes
        setPosts(data);
        console.log(`[NewsFeed] Successfully loaded ${data.length} posts`);
      }
    } catch (error) {
      console.error(`[NewsFeed] Error fetching posts:`, error);
      // Graceful fallback - maintain existing posts
    }
  }, [currentUserId]);

  useEffect(() => { fetchPosts(); const interval = setInterval(fetchPosts, 120000); return () => clearInterval(interval); }, [fetchPosts]);

  const handleCreatePost = async () => {
    if (!inputText.trim() && selectedImages.length === 0) return;
    setIsLoading(true); 
    setIsProcessingImages(true);
    
    try {
      console.log(`[NewsFeed] Creating post with ${selectedImages.length} images`);
      const compressedImages = await Promise.all(selectedImages.map(img => compressImage(img)));
      const newPost = { 
        userId: currentUserId, 
        userFullName: currentUser.fullName, 
        userAvatar: currentUser.avatar, 
        userBadges: currentUser.badges || [], 
        content: inputText, 
        imageUrls: compressedImages, 
        timestamp: new Date().toISOString(), 
        reactions: [] 
      };
      const saved = await Database.createPost(newPost as any);
      if (saved) { 
        setPosts([saved, ...posts]); 
        setInputText(''); 
        setSelectedImages([]);
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

  const handleReaction = async (postId: string, type: string) => {
    const updatedPost = await Database.reactToPost(postId, currentUserId, type, currentUser.fullName, currentUser.avatar);
    if (updatedPost) {
      setPosts(prev => prev.map(p => (p.id || (p as any)._id) === (updatedPost.id || (updatedPost as any)._id) ? { ...updatedPost, id: updatedPost.id || (updatedPost as any)._id } : p));
      if (window.debugLog) {
        const reactionLabel = REACTION_TYPES.find(r => r.type === type)?.label || type;
        window.debugLog(`Người dùng @${currentUser.username} đã bày tỏ cảm xúc ${reactionLabel} với một bài viết`, "user");
      }
    }
    setShowReactionsFor(null);
  };

  const handleRemoveReaction = async (postId: string, type: string) => {
    const updatedPost = await Database.removeReaction(postId, currentUserId, type);
    if (updatedPost) {
      setPosts(prev => prev.map(p => (p.id || (p as any)._id) === (updatedPost.id || (updatedPost as any)._id) ? { ...updatedPost, id: updatedPost.id || (updatedPost as any)._id } : p));
      console.log(`[NewsFeed] Removed reaction: user=${currentUserId}, post=${postId}, type=${type}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (confirm("Xóa bài viết này?")) { await Database.deletePost(postId); fetchPosts(); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <PostCreator 
        currentUser={currentUser} inputText={inputText} setInputText={setInputText} 
        selectedImages={selectedImages} setSelectedImages={setSelectedImages} 
        isProcessingImages={isProcessingImages} isLoading={isLoading} 
        onCreate={handleCreatePost} onImageChange={handleImageChange} 
      />
      <div className="space-y-6">
        {posts.map(post => (
          <PostItem 
            key={post.id || (post as any)._id} post={post} currentUser={currentUser} 
            onEdit={() => {}} onDelete={handleDeletePost} onReact={handleReaction} 
            onRemoveReact={handleRemoveReaction}
            showReactions={showReactionsFor} setShowReactions={setShowReactionsFor} 
            reactionTypes={REACTION_TYPES} 
          />
        ))}
      </div>
    </div>
  );
});

NewsFeed.displayName = 'NewsFeed';

export default NewsFeed;
