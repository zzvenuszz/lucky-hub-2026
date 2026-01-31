
import React, { useState, useEffect, useRef } from 'react';
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

const formatTimeAgo = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'Vừa xong';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} phút trước`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} giờ trước`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Hôm qua';
  if (diffInDays < 7) return `${diffInDays} ngày trước`;
  return date.toLocaleDateString('vi-VN');
};

/**
 * Hàm nén ảnh phía Client
 */
const compressImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1024;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);
      
      ctx.drawImage(img, 0, 0, width, height);
      // Nén ảnh về định dạng JPEG với chất lượng 0.7
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const ImageGrid: React.FC<{ images: string[] }> = ({ images }) => {
  if (!images || images.length === 0) return null;
  const count = images.length;
  if (count === 1) {
    return (
      <div className="rounded-[2rem] overflow-hidden border border-slate-50 shadow-inner">
        <img src={images[0]} className="w-full h-auto object-cover max-h-[600px]" alt="Post" />
      </div>
    );
  }
  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-[2rem] overflow-hidden">
        {images.map((img, i) => <img key={i} src={img} className="w-full h-64 object-cover" alt="Post" />)}
      </div>
    );
  }
  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-[2rem] overflow-hidden">
        <img src={images[0]} className="col-span-2 w-full h-64 object-cover" alt="Post" />
        <img src={images[1]} className="w-full h-48 object-cover" alt="Post" />
        <img src={images[2]} className="w-full h-48 object-cover" alt="Post" />
      </div>
    );
  }
  if (count === 4) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-[2rem] overflow-hidden">
        {images.map((img, i) => <img key={i} src={img} className="w-full h-48 object-cover" alt="Post" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-6 gap-1 rounded-[2rem] overflow-hidden h-[400px]">
      <div className="col-span-3 h-full"><img src={images[0]} className="w-full h-full object-cover" alt="Post" /></div>
      <div className="col-span-3 h-full"><img src={images[1]} className="w-full h-full object-cover" alt="Post" /></div>
      <div className="col-span-2 h-[150px]"><img src={images[2]} className="w-full h-full object-cover" alt="Post" /></div>
      <div className="col-span-2 h-[150px]"><img src={images[3]} className="w-full h-full object-cover" alt="Post" /></div>
      <div className="col-span-2 h-[150px] relative">
        <img src={images[4]} className="w-full h-full object-cover brightness-50" alt="Post" />
        {count > 5 && <div className="absolute inset-0 flex items-center justify-center text-white text-xl font-black">+{count - 5}</div>}
      </div>
    </div>
  );
};

const NewsFeed: React.FC<NewsFeedProps> = ({ currentUser }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editExistingImages, setEditExistingImages] = useState<PostImage[]>([]);
  const [editNewImages, setEditNewImages] = useState<string[]>([]);
  
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null);
  const [showWhoReacted, setShowWhoReacted] = useState<Post | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const reactionMenuRef = useRef<HTMLDivElement>(null);
  
  const currentUserId = (currentUser as any).id || (currentUser as any)._id;

  const fetchPosts = async () => {
    const data = await Database.getPosts();
    if (data) setPosts(data);
  };

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reactionMenuRef.current && !reactionMenuRef.current.contains(event.target as Node)) {
        setShowReactionsFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreatePost = async () => {
    if (!inputText.trim() && selectedImages.length === 0) return;
    setIsLoading(true);
    setIsProcessingImages(true);
    
    try {
      // Thực hiện nén tất cả ảnh đã chọn
      const compressedImages = await Promise.all(selectedImages.map(img => compressImage(img)));
      
      const newPostData = {
        userId: currentUserId,
        userFullName: currentUser.fullName,
        userAvatar: currentUser.avatar,
        userBadges: currentUser.badges || [],
        content: inputText,
        imageUrls: compressedImages,
        timestamp: new Date().toISOString(),
        reactions: []
      };
      
      const saved = await Database.createPost(newPostData as any);
      if (saved) {
        setPosts([saved, ...posts]);
        setInputText('');
        setSelectedImages([]);
      }
    } catch (err) {
      console.error("Lỗi khi đăng bài:", err);
    } finally {
      setIsProcessingImages(false);
      setIsLoading(false);
    }
  };

  const handleUpdatePost = async () => {
    if (!editingPost) return;
    setIsLoading(true);
    setIsProcessingImages(true);

    try {
      const postId = editingPost.id || (editingPost as any)._id;
      // Nén các ảnh mới được thêm vào
      const compressedNewImages = await Promise.all(editNewImages.map(img => compressImage(img)));
      
      const updated = await Database.updatePost(postId, {
        content: editContent,
        existingImages: editExistingImages,
        newImages: compressedNewImages
      });
      if (updated) {
        setPosts(prev => prev.map(p => {
          const pId = p.id || (p as any)._id;
          const uId = updated.id || (updated as any)._id;
          return pId === uId ? { ...updated, id: uId } : p;
        }));
        setEditingPost(null);
      }
    } catch (err) {
      console.error("Lỗi khi cập nhật bài viết:", err);
    } finally {
      setIsProcessingImages(false);
      setIsLoading(false);
    }
  };

  const openEditModal = (post: Post) => {
    setEditingPost(post);
    setEditContent(post.content);
    setEditExistingImages(post.images || []);
    setEditNewImages([]);
  };

  /**
   * PHÂN TÍCH: TypeScript báo lỗi 'unknown' không thể gán cho 'Blob' tại dòng reader.readAsDataURL(file).
   * NGUYÊN NHÂN: Array.from từ FileList trả về mảng có các phần tử bị trình biên dịch coi là unknown trong một số môi trường, 
   * trong khi reader.readAsDataURL yêu cầu kiểu Blob (hoặc File kế thừa từ Blob).
   * GIẢI QUYẾT: Ép kiểu tường minh cho biến 'file' thành 'any' để trình biên dịch chấp nhận tham số.
   */
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: any) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isEdit) setEditNewImages(prev => [...prev, reader.result as string]);
        else setSelectedImages(prev => [...prev, reader.result as string]);
      };
      // file ở đây có thể bị suy luận là unknown, ép kiểu any để đảm bảo tính tương thích với readAsDataURL(Blob)
      reader.readAsDataURL(file);
    });
  };

  const handleReaction = async (postId: string, type: string) => {
    const updatedPost = await Database.reactToPost(postId, currentUserId, type, currentUser.fullName, currentUser.avatar);
    if (updatedPost) {
      setPosts(prev => prev.map(p => {
        const pId = p.id || (p as any)._id;
        const uId = updatedPost.id || (updatedPost as any)._id;
        return pId === uId ? { ...updatedPost, id: uId } : p;
      }));
    }
    setShowReactionsFor(null);
  };

  const getReactionCountByType = (post: Post, type: string) => {
    return post.reactions?.filter(r => r.type === type).reduce((sum, curr) => sum + curr.count, 0) || 0;
  };

  const getTotalReactionCount = (post: Post) => {
    return post.reactions?.reduce((sum, curr) => sum + curr.count, 0) || 0;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 space-y-4">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
            <img src={currentUser.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.fullName}&backgroundColor=f8fafc`} className="w-full h-full object-cover" alt="Me" />
          </div>
          <div className="flex-1 space-y-2">
            <textarea 
              placeholder={`Bạn đang nghĩ gì, ${currentUser.fullName.split(' ').pop()}?`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full bg-slate-50 border-none outline-none focus:ring-1 focus:ring-emerald-500 rounded-2xl p-4 text-sm font-medium resize-none min-h-[80px]"
            />
            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedImages.map((img, i) => (
                  <div key={i} className="relative w-20 h-20">
                    <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-white shadow-sm" alt="Preview" />
                    <button onClick={() => setSelectedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-rose-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
              <div className="flex items-center gap-4">
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">📸 Đăng ảnh</button>
                {isProcessingImages && <span className="text-[10px] font-black text-emerald-600 animate-pulse uppercase tracking-widest">⚡ Đang tối ưu ảnh...</span>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleImageChange(e, false)} />
              <button onClick={handleCreatePost} disabled={isLoading || isProcessingImages || (!inputText.trim() && selectedImages.length === 0)} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50">
                {isLoading ? 'Đang đăng...' : 'Chia sẻ'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {posts.map(post => {
          const postId = post.id || (post as any)._id;
          const totalReacts = getTotalReactionCount(post);
          const isOwner = currentUserId === post.userId;
          const isAdmin = currentUser.role === UserRole.ADMIN;

          return (
            <div key={postId} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden group hover:shadow-md transition-all">
              <div className="p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
                  <img src={post.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${post.userFullName}&backgroundColor=f8fafc`} className="w-full h-full object-cover" alt={post.userFullName} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-black text-slate-800 text-sm truncate">{post.userFullName}</span>
                    <BadgeDisplay badgeIds={post.userBadges} isCommunity={true} />
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {formatTimeAgo(post.timestamp)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isOwner || isAdmin) && (
                    <button onClick={() => openEditModal(post)} className="text-slate-300 hover:text-emerald-500 transition-colors p-2" title="Sửa bài viết">✏️</button>
                  )}
                  {(isOwner || isAdmin) && (
                    <button onClick={() => { if(confirm("Xóa bài viết này?")) Database.deletePost(postId).then(fetchPosts); }} className="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Xóa bài viết">🗑️</button>
                  )}
                </div>
              </div>
              
              <div className="px-5 pb-3 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{post.content}</p>
                <ImageGrid images={post.imageUrls || []} />
              </div>

              <div className="px-5 pb-4">
                <div className="flex items-center justify-between border-t border-slate-50 pt-3 relative">
                  <div className="flex items-center gap-2">
                    <div className="relative" ref={showReactionsFor === postId ? reactionMenuRef : null}>
                      <button 
                        onClick={() => setShowReactionsFor(showReactionsFor === postId ? null : postId)}
                        onMouseEnter={() => window.innerWidth > 768 && setShowReactionsFor(postId)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest ${showReactionsFor === postId ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}
                      >
                        👍 Tương tác
                      </button>

                      {showReactionsFor === postId && (
                        <div 
                          onMouseLeave={() => window.innerWidth > 768 && setShowReactionsFor(null)}
                          className="absolute bottom-full left-0 mb-2 bg-white rounded-full shadow-2xl border border-slate-100 p-1.5 flex items-center gap-1 animate-in slide-in-from-bottom-2 duration-200 z-10"
                        >
                          {REACTION_TYPES.map(react => (
                            <button key={react.type} onClick={() => handleReaction(postId, react.type)} className="w-10 h-10 flex items-center justify-center text-xl hover:scale-150 transition-transform rounded-full hover:bg-slate-50">{react.icon}</button>
                          ))}
                          <div className="w-[1px] h-6 bg-slate-100 mx-1"></div>
                          <button onClick={() => handleReaction(postId, 'clear')} className="w-10 h-10 flex items-center justify-center text-sm grayscale hover:grayscale-0 hover:bg-rose-50 rounded-full" title="Xóa tất cả cảm xúc của bạn">❌</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {totalReacts > 0 && (
                    <button onClick={() => setShowWhoReacted(post)} className="flex items-center -space-x-1.5 hover:opacity-80 transition-opacity">
                      {REACTION_TYPES.map(r => {
                        const count = getReactionCountByType(post, r.type);
                        if (count === 0) return null;
                        return (<div key={r.type} className="w-6 h-6 bg-white border-2 border-white rounded-full flex items-center justify-center shadow-sm text-[10px]">{r.icon}</div>);
                      })}
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{totalReacts} tương tác</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingPost && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-emerald-600 text-white flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-xs">Chỉnh sửa bài viết</h3>
              <button onClick={() => setEditingPost(null)} className="text-2xl hover:scale-110">×</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar">
              {isProcessingImages && (
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 flex items-center justify-center gap-3 animate-pulse">
                   <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                   <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Lucky AI đang tối ưu hóa hình ảnh của bạn...</span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nội dung</label>
                <textarea 
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full bg-slate-50 border-none outline-none focus:ring-1 focus:ring-emerald-500 rounded-2xl p-4 text-sm font-medium resize-none min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hình ảnh hiện tại</label>
                <div className="flex flex-wrap gap-2">
                  {editExistingImages.map((img, i) => (
                    <div key={i} className="relative w-24 h-24">
                      <img src={img.url} className="w-full h-full object-cover rounded-xl border-2 border-white shadow-sm" alt="Existing" />
                      <button onClick={() => setEditExistingImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center shadow-md">×</button>
                    </div>
                  ))}
                  {editExistingImages.length === 0 && <div className="text-[10px] text-slate-400 italic">Tất cả ảnh đã bị gỡ.</div>}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Thêm ảnh mới</label>
                <div className="flex flex-wrap gap-2">
                  {editNewImages.map((img, i) => (
                    <div key={i} className="relative w-24 h-24">
                      <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-emerald-100 shadow-sm" alt="New" />
                      <button onClick={() => setEditNewImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-rose-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center shadow-md">×</button>
                    </div>
                  ))}
                  <button onClick={() => editFileInputRef.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:border-emerald-300 hover:text-emerald-500 transition-all">
                    <span className="text-xl">+</span>
                    <span className="text-[8px] font-black uppercase">Thêm ảnh</span>
                  </button>
                  <input type="file" ref={editFileInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleImageChange(e, true)} />
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button onClick={() => setEditingPost(null)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest">Hủy</button>
              <button 
                onClick={handleUpdatePost} 
                disabled={isLoading || isProcessingImages || (!editContent.trim() && editExistingImages.length === 0 && editNewImages.length === 0)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100 disabled:opacity-50"
              >
                {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhoReacted && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Ai đã tương tác?</h3>
              <button onClick={() => setShowWhoReacted(null)} className="text-xl text-slate-400">×</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3 no-scrollbar">
              {showWhoReacted.reactions?.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-transparent hover:border-emerald-100 transition-all">
                  <div className="flex items-center gap-3">
                    <img src={r.userAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${r.userName}&backgroundColor=f8fafc`} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm" alt="Avatar" />
                    <div>
                      <div className="font-bold text-xs text-slate-800">{r.userName || 'Hội viên'}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Đã thả {r.count} lần</div>
                    </div>
                  </div>
                  <div className="text-2xl">{REACTION_TYPES.find(rt => rt.type === r.type)?.icon}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewsFeed;
