
import React, { useState, useEffect, useRef } from 'react';
import { User, Post, UserRole, PostReaction } from '../types.ts';
import { Database } from '../services/database.ts';
import BadgeDisplay from './BadgeDisplay.tsx';

interface NewsFeedProps {
  currentUser: User;
}

const REACTION_TYPES = [
  { type: 'like', icon: '👍', label: 'Thích', color: 'text-blue-500' },
  { type: 'love', icon: '❤️', label: 'Yêu thích', color: 'text-rose-500' },
  { type: 'haha', icon: '😂', label: 'Haha', color: 'text-amber-500' },
  { type: 'wow', icon: '😮', label: 'Wow', color: 'text-yellow-500' },
  { type: 'sad', icon: '😢', label: 'Buồn', color: 'text-blue-400' },
  { type: 'angry', icon: '😡', label: 'Phẫn nộ', color: 'text-orange-600' },
];

const NewsFeed: React.FC<NewsFeedProps> = ({ currentUser }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  const fetchPosts = async () => {
    const data = await Database.getPosts();
    if (data) {
      setPosts(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }
  };

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreatePost = async () => {
    if (!inputText.trim() && !selectedImage) return;
    setIsLoading(true);

    const newPost: Omit<Post, 'id'> = {
      userId: currentUserId,
      userFullName: currentUser.fullName,
      userAvatar: currentUser.avatar,
      userBadges: currentUser.badges || [],
      content: inputText,
      imageUrl: selectedImage || undefined,
      timestamp: new Date().toISOString(),
      reactions: []
    };

    const saved = await Database.createPost(newPost);
    if (saved) {
      setPosts([saved, ...posts]);
      setInputText('');
      setSelectedImage(null);
    }
    setIsLoading(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleReaction = async (postId: string, type: string) => {
    const updatedPost = await Database.reactToPost(postId, currentUserId, type);
    if (updatedPost) {
      setPosts(prev => prev.map(p => (p.id === postId || (p as any)._id === postId) ? { ...updatedPost, id: postId } : p));
    }
    setShowReactionsFor(null);
  };

  const getUserReaction = (post: Post) => {
    return post.reactions?.find(r => r.userId === currentUserId)?.type;
  };

  const getReactionCount = (post: Post, type: string) => {
    return post.reactions?.filter(r => r.type === type).length || 0;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Create Post Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 space-y-4">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
            <img 
              src={currentUser.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.fullName}&backgroundColor=f8fafc`} 
              className="w-full h-full object-cover" 
              alt="Me" 
            />
          </div>
          <div className="flex-1 space-y-2">
            <textarea 
              placeholder={`Bạn đang nghĩ gì, ${currentUser.fullName.split(' ').pop()}?`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full bg-slate-50 border-none outline-none focus:ring-1 focus:ring-emerald-500 rounded-2xl p-4 text-sm font-medium resize-none min-h-[100px]"
            />
            
            {selectedImage && (
              <div className="relative inline-block mt-2">
                <img src={selectedImage} className="max-h-64 rounded-2xl border-4 border-white shadow-md" alt="Preview" />
                <button 
                  onClick={() => setSelectedImage(null)} 
                  className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full shadow-lg flex items-center justify-center font-bold text-xs"
                >
                  ×
                </button>
              </div>
            )}
            
            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
              >
                📸 Hình ảnh hành trình
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
              
              <button 
                onClick={handleCreatePost}
                disabled={isLoading || (!inputText.trim() && !selectedImage)}
                className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isLoading ? 'Đang đăng...' : 'Chia sẻ ngay'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed Section */}
      <div className="space-y-6">
        {posts.map(post => {
          const postId = post.id || (post as any)._id;
          const userReactionType = getUserReaction(post);
          const currentReact = REACTION_TYPES.find(r => r.type === userReactionType);
          const hasAdminPrivilege = currentUser.role === UserRole.ADMIN;
          const isOwner = currentUserId === post.userId;

          return (
            <div key={postId} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-all">
              <div className="p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
                  <img 
                    src={post.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.userFullName}&backgroundColor=f8fafc`} 
                    className="w-full h-full object-cover" 
                    alt={post.userFullName} 
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-black text-slate-800 text-sm truncate">{post.userFullName}</span>
                    <BadgeDisplay badgeIds={post.userBadges} />
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {new Date(post.timestamp).toLocaleDateString('vi-VN')} • {new Date(post.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </div>
                {/* Admin có thể xóa bài bất kỳ, hoặc User xóa bài của mình */}
                {(isOwner || hasAdminPrivilege) && (
                  <button 
                    onClick={() => { if(confirm(hasAdminPrivilege && !isOwner ? "Bạn là Admin, xóa bài viết vi phạm này?" : "Xóa bài viết này?")) Database.deletePost(postId).then(fetchPosts); }} 
                    className={`transition-colors p-2 rounded-lg ${hasAdminPrivilege && !isOwner ? 'text-rose-500 bg-rose-50 hover:bg-rose-100' : 'text-slate-300 hover:text-rose-500 hover:bg-slate-50'}`}
                    title={hasAdminPrivilege && !isOwner ? "Quyền Quản trị viên" : "Xóa bài"}
                  >
                    🗑️
                  </button>
                )}
              </div>
              
              <div className="px-5 pb-3 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{post.content}</p>
                {post.imageUrl && (
                  <div className="rounded-[2rem] overflow-hidden border border-slate-50 shadow-inner">
                    <img src={post.imageUrl} className="w-full h-auto object-cover max-h-[500px]" alt="Journey" />
                  </div>
                )}
              </div>

              {/* Interaction Bar */}
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between border-t border-slate-50 pt-3 relative">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <button 
                        onMouseEnter={() => setShowReactionsFor(postId)}
                        onClick={() => handleReaction(postId, 'like')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all ${currentReact ? 'bg-slate-50 ' + currentReact.color : 'text-slate-500 hover:bg-slate-50'}`}
                      >
                        <span className="text-lg">{currentReact ? currentReact.icon : '👍'}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {currentReact ? currentReact.label : 'Tương tác'}
                        </span>
                      </button>

                      {/* Floating Reaction Selector */}
                      {showReactionsFor === postId && (
                        <div 
                          onMouseLeave={() => setShowReactionsFor(null)}
                          className="absolute bottom-full left-0 mb-2 bg-white rounded-full shadow-2xl border border-slate-100 p-1 flex items-center gap-1 animate-in slide-in-from-bottom-2 duration-200 z-10"
                        >
                          {REACTION_TYPES.map(react => (
                            <button 
                              key={react.type} 
                              onClick={() => handleReaction(postId, react.type)}
                              className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-transform hover:bg-slate-50 rounded-full"
                              title={react.label}
                            >
                              {react.icon}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reaction Summary */}
                  <div className="flex items-center -space-x-1">
                    {REACTION_TYPES.map(r => {
                      const count = getReactionCount(post, r.type);
                      if (count === 0) return null;
                      return (
                        <div key={r.type} className="flex items-center bg-white border border-slate-50 rounded-full px-1.5 py-0.5 shadow-sm" title={`${count} lượt ${r.label}`}>
                          <span className="text-xs">{r.icon}</span>
                          <span className="text-[9px] font-black text-slate-500 ml-0.5">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {posts.length === 0 && (
          <div className="py-20 text-center space-y-4">
            <div className="text-6xl grayscale opacity-30">🍀</div>
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Chưa có bài viết nào trên bảng tin</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsFeed;
