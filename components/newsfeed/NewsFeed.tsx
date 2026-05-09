
import React, { useState, useEffect, useCallback, memo } from 'react';
import { User, Post, UserRole } from '../../types.ts';
import { Database } from '../../services/database.ts';
import PostCreator from './PostCreator.tsx';
import PostItem from './PostItem.tsx';

interface NewsFeedProps {
  currentUser: User;
}

const REACTION_TYPES = [
  { type: 'like', icon: '👍' }, { type: 'love', icon: '❤️' }, { type: 'haha', icon: '😂' }, 
  { type: 'wow', icon: '😮' }, { type: 'sad', icon: '😢' }, { type: 'angry', icon: '😡' },
];

const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image(); img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas'); const MAX_WIDTH = 1024;
      let width = img.width; let height = img.height;
      if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str); ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const NewsFeed: React.FC<NewsFeedProps> = ({ currentUser }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  const fetchPosts = useCallback(async () => {
    const data = await Database.getPosts();
    if (data) setPosts(data);
  }, []);

  useEffect(() => { fetchPosts(); const interval = setInterval(fetchPosts, 30000); return () => clearInterval(interval); }, [fetchPosts]);

  const handleCreatePost = async () => {
    if (!inputText.trim() && selectedImages.length === 0) return;
    setIsLoading(true); setIsProcessingImages(true);
    const compressedImages = await Promise.all(selectedImages.map(img => compressImage(img)));
    const newPost = { userId: currentUserId, userFullName: currentUser.fullName, userAvatar: currentUser.avatar, userBadges: currentUser.badges || [], content: inputText, imageUrls: compressedImages, timestamp: new Date().toISOString(), reactions: [] };
    const saved = await Database.createPost(newPost as any);
    if (saved) { 
      setPosts([saved, ...posts]); 
      setInputText(''); 
      setSelectedImages([]); 
      if (window.debugLog) window.debugLog(`Người dùng @${currentUser.username} đã đăng bài viết mới`, "user");
    }
    setIsLoading(false); setIsProcessingImages(false);
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
            showReactions={showReactionsFor} setShowReactions={setShowReactionsFor} 
            reactionTypes={REACTION_TYPES} 
          />
        ))}
      </div>
    </div>
  );
};

export default memo(NewsFeed);
