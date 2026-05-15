import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Post } from '../../types.ts';
import { Database } from '../../services/database.ts';

interface PostEditorProps {
  post: Post;
  onClose: () => void;
  onSave: (updatedPost: Post) => void;
  popularHashtags: string[];
}

const PostEditor: React.FC<PostEditorProps> = memo(({ post, onClose, onSave, popularHashtags }) => {
  const [content, setContent] = useState(post.content || '');
  const [existingImages, setExistingImages] = useState<string[]>(post.imageUrls || []);
  const [newImages, setNewImages] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState<string[]>(post.hashtags || []);
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hashtagInputRef = useRef<HTMLInputElement>(null);

  // Filter hashtag suggestions based on input
  const filteredSuggestions = popularHashtags.filter(
    h => !hashtags.includes(h) && h.toLowerCase().includes(hashtagInput.replace('#', '').toLowerCase())
  );

  const handleHashtagChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHashtagInput(value);
    
    // Show suggestions when user types #
    if (value.startsWith('#') && value.length > 1) {
      setShowHashtagSuggestions(true);
    } else {
      setShowHashtagSuggestions(false);
    }

    // Auto-add hashtag when user types space or comma
    if (value.endsWith(' ') || value.endsWith(',')) {
      const tag = value.replace(/[, ]/g, '').trim();
      if (tag.startsWith('#') && tag.length > 1 && !hashtags.includes(tag)) {
        setHashtags(prev => [...prev, tag]);
      }
      setHashtagInput('');
      setShowHashtagSuggestions(false);
    }
  }, [hashtags]);

  const addHashtag = useCallback((tag: string) => {
    if (!hashtags.includes(tag)) {
      setHashtags(prev => [...prev, tag]);
    }
    setHashtagInput('');
    setShowHashtagSuggestions(false);
    hashtagInputRef.current?.focus();
  }, [hashtags]);

  const removeHashtag = useCallback((tag: string) => {
    setHashtags(prev => prev.filter(t => t !== tag));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && hashtagInput.startsWith('#') && hashtagInput.length > 1) {
      e.preventDefault();
      addHashtag(hashtagInput.trim());
    }
    if (e.key === 'Backspace' && hashtagInput === '' && hashtags.length > 0) {
      setHashtags(prev => prev.slice(0, -1));
    }
  }, [hashtagInput, hashtags, addHashtag]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeExistingImage = useCallback((index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removeNewImage = useCallback((index: number) => {
    setNewImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!content.trim() && existingImages.length === 0 && newImages.length === 0) {
      setErrors('Vui lòng nhập nội dung hoặc thêm ảnh');
      return;
    }

    setIsSaving(true);
    setErrors(null);

    try {
      console.log(`[PostEditor] Saving post ${post.id}...`);
      const updated = await Database.updatePost(
        post.id || (post as any)._id,
        {
          content: content.trim(),
          existingImages,
          newImages,
          hashtags
        }
      );
      if (updated) {
        console.log(`[PostEditor] Post saved successfully`);
        onSave({ ...updated, id: updated.id || (updated as any)._id });
        onClose();
      } else {
        setErrors('Không thể lưu bài viết. Vui lòng thử lại.');
      }
    } catch (error: any) {
      console.error(`[PostEditor] Error saving post:`, error);
      setErrors(error.message || 'Có lỗi xảy ra khi lưu bài viết');
    } finally {
      setIsSaving(false);
    }
  }, [content, existingImages, newImages, hashtags, post, onSave, onClose]);

  // Handle clicking outside suggestions to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hashtagInputRef.current && !hashtagInputRef.current.contains(e.target as Node)) {
        setShowHashtagSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div 
        className="bg-white rounded-[2.5rem] shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-black text-slate-800 text-lg">Chỉnh sửa bài viết</h3>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-4">
          {/* Text Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nhập nội dung..."
            className="w-full bg-slate-50 border-none outline-none focus:ring-1 focus:ring-emerald-500 rounded-2xl p-4 text-sm font-medium resize-none min-h-[120px]"
          />

          {/* Existing Images */}
          {existingImages.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Ảnh hiện tại</p>
              <div className="flex flex-wrap gap-2">
                {existingImages.map((img, i) => (
                  <div key={`existing-${i}`} className="relative w-20 h-20 group">
                    <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-white shadow-sm" alt="" />
                    <button 
                      onClick={() => removeExistingImage(i)}
                      className="absolute -top-1 -right-1 bg-rose-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Images */}
          {newImages.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Ảnh mới</p>
              <div className="flex flex-wrap gap-2">
                {newImages.map((img, i) => (
                  <div key={`new-${i}`} className="relative w-20 h-20 group">
                    <img src={img} className="w-full h-full object-cover rounded-xl border-2 border-emerald-200 shadow-sm" alt="" />
                    <button 
                      onClick={() => removeNewImage(i)}
                      className="absolute -top-1 -right-1 bg-rose-500 text-white w-5 h-5 rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Image Button */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
          >
            📸 Thêm ảnh
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            multiple 
            onChange={handleImageSelect} 
          />

          {/* Hashtag Input */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Hashtag</p>
            
            {/* Current hashtags */}
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {hashtags.map((tag, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold"
                  >
                    {tag}
                    <button onClick={() => removeHashtag(tag)} className="hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <input
                ref={hashtagInputRef}
                type="text"
                value={hashtagInput}
                onChange={handleHashtagChange}
                onKeyDown={handleKeyDown}
                placeholder="Nhập #hashtag và Enter..."
                className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-1 focus:ring-blue-400 rounded-xl px-4 py-2 text-sm"
              />
              
              {/* Hashtag Suggestions */}
              {showHashtagSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-10">
                  {filteredSuggestions.slice(0, 5).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => addHashtag(tag)}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {errors && (
            <div className="bg-rose-50 text-rose-600 rounded-xl px-4 py-3 text-xs font-bold">
              {errors}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-all"
          >
            Hủy
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
});

PostEditor.displayName = 'PostEditor';

export default PostEditor;