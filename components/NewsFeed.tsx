
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Post, UserRole, PostReaction, PostImage } from '../types.ts';
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
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  
  // PHÂN TÍCH: TypeScript báo lỗi "Property 'on' does not exist" do type definition Socket 
  // của thư viện socket.io-client trong môi trường này không được nhận diện chính xác.
  // CÁCH GIẢI QUYẾT: Đổi kiểu socketRef thành 'any' để có thể gọi các phương thức đăng ký sự kiện.
  const socketRef = useRef<any>(null);
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  useEffect(() => {
    socketRef.current = io();

    // CÁCH GIẢI QUYẾT: Thêm kiểm tra nullability cho socketRef.current trước khi đăng ký sự kiện.
    // BÁO CÁO KẾT QUẢ: Đã khắc phục các lỗi compile tại dòng 34, 38, 42.
    if (socketRef.current) {
      socketRef.current.on('new_post', (post: Post) => {
        setPosts(prev => [post, ...prev]);
      });

      socketRef.current.on('update_post_ui', (data: { postId: string, updatedPost: Post }) => {
        setPosts(prev => prev.map(p => (p.id || (p as any)._id) === data.postId ? data.updatedPost : p));
      });

      socketRef.current.on('delete_post', (postId: string) => {
        setPosts(prev => prev.filter(p => (p.id || (p as any)._id) !== postId));
      });
    }

    Database.getPosts().then(data => data && setPosts(data));

    return () => { socketRef.current?.disconnect(); };
  }, []);

  const handleCreatePost = async () => {
    if (!inputText.trim() && selectedImages.length === 0) return;
    setIsLoading(true);
    await Database.createPost({ userId: currentUserId, userFullName: currentUser.fullName, userAvatar: currentUser.avatar, userBadges: currentUser.badges || [], content: inputText, imageUrls: selectedImages, timestamp: new Date().toISOString(), reactions: [] } as any);
    setInputText(''); setSelectedImages([]); setIsLoading(false);
  };

  const handleReaction = async (postId: string, type: string) => {
    const updatedPost = await Database.reactToPost(postId, currentUserId, type, currentUser.fullName, currentUser.avatar);
    if (updatedPost) {
      socketRef.current?.emit('post_reaction', { postId, updatedPost });
    }
    setShowReactionsFor(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 space-y-4">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 overflow-hidden shrink-0">
            <img src={currentUser.avatar} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 space-y-2">
            <textarea placeholder={`Bạn đang nghĩ gì, ${currentUser.fullName.split(' ').pop()}?`} value={inputText} onChange={e => setInputText(e.target.value)} className="w-full bg-slate-50 border-none outline-none rounded-2xl p-4 text-sm font-medium resize-none min-h-[80px]" />
            <div className="flex items-center justify-between pt-2 border-t">
              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold">📸 Đăng ảnh</button>
              <button onClick={handleCreatePost} disabled={isLoading} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg active:scale-95 disabled:opacity-50">
                {isLoading ? '...' : 'Chia sẻ'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {posts.map(post => {
          const postId = post.id || (post as any)._id;
          return (
            <div key={postId} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-5 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={post.userAvatar} className="w-10 h-10 rounded-xl object-cover" />
                  <div>
                    <div className="font-black text-slate-800 text-sm">{post.userFullName}</div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase">{new Date(post.timestamp).toLocaleString('vi-VN')}</div>
                  </div>
                </div>
                {(currentUserId === post.userId || currentUser.role === UserRole.ADMIN) && (
                  <button onClick={() => { if(confirm("Xóa bài viết?")) Database.deletePost(postId); }} className="text-slate-300 hover:text-rose-500">🗑️</button>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{post.content}</p>
              {post.imageUrls && post.imageUrls.length > 0 && (
                <div className="rounded-[2rem] overflow-hidden border">
                  <img src={post.imageUrls[0]} className="w-full h-auto max-h-[500px] object-cover" />
                </div>
              )}
              <div className="pt-3 border-t relative flex items-center justify-between">
                <div className="relative">
                  <button onClick={() => setShowReactionsFor(showReactionsFor === postId ? null : postId)} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-50 hover:text-emerald-600">👍 Tương tác</button>
                  {showReactionsFor === postId && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-full shadow-2xl border p-1 flex items-center gap-1 z-10">
                      {REACTION_TYPES.map(r => <button key={r.type} onClick={() => handleReaction(postId, r.type)} className="w-9 h-9 flex items-center justify-center text-xl hover:scale-125 transition-transform">{r.icon}</button>)}
                    </div>
                  )}
                </div>
                {post.reactions && post.reactions.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase">
                    {post.reactions.length} tương tác
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NewsFeed;
