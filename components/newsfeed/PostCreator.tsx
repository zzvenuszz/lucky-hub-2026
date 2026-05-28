import React, { useRef, memo, useState, useCallback } from 'react';
import { User } from '../../types.ts';
import LoadingButton from '../system/LoadingButton.tsx';

interface PostCreatorProps {
  currentUser: User;
  inputText: string;
  setInputText: (text: string) => void;
  selectedImages: string[];
  setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>;
  isProcessingImages: boolean;
  isLoading: boolean;
  onCreate: () => void;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  popularHashtags?: string[];
  hashtags: string[];
  setHashtags: React.Dispatch<React.SetStateAction<string[]>>;
}

const PostCreator: React.FC<PostCreatorProps> = ({ 
  currentUser, inputText, setInputText, selectedImages, setSelectedImages, 
  isProcessingImages, isLoading, onCreate, onImageChange, popularHashtags = [],
  hashtags, setHashtags
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hashtagInput, setHashtagInput] = useState('');
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const hashtagInputRef = useRef<HTMLInputElement>(null);

  // Filter hashtag suggestions
  const filteredSuggestions = popularHashtags.filter(
    h => !hashtags.includes(h) && h.toLowerCase().includes(hashtagInput.replace('#', '').toLowerCase())
  );

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

  const handleHashtagChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHashtagInput(value);
    
    if (value.startsWith('#') && value.length > 1) {
      setShowHashtagSuggestions(true);
    } else {
      setShowHashtagSuggestions(false);
    }

    if (value.endsWith(' ') || value.endsWith(',')) {
      const tag = value.replace(/[, ]/g, '').trim();
      if (tag.startsWith('#') && tag.length > 1 && !hashtags.includes(tag)) {
        setHashtags(prev => [...prev, tag]);
      }
      setHashtagInput('');
      setShowHashtagSuggestions(false);
    }
  }, [hashtags]);

  const handleHashtagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && hashtagInput.startsWith('#') && hashtagInput.length > 1) {
      e.preventDefault();
      addHashtag(hashtagInput.trim());
    }
    if (e.key === 'Backspace' && hashtagInput === '' && hashtags.length > 0) {
      setHashtags(prev => prev.slice(0, -1));
    }
  }, [hashtagInput, hashtags, addHashtag]);

  // Handle click outside suggestions
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (hashtagInputRef.current && !hashtagInputRef.current.contains(e.target as Node)) {
        setShowHashtagSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-6 space-y-4">
      <div className="flex gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm overflow-hidden shrink-0">
          <img src={currentUser.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.fullName}`} className="w-full h-full object-cover" alt="Me" />
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

          {/* Hashtag Input */}
          <div className="pt-1">
            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {hashtags.map((tag, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold"
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
                onKeyDown={handleHashtagKeyDown}
                placeholder="Thêm #hashtag..."
                className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-1 focus:ring-blue-400 rounded-xl px-3 py-1.5 text-xs"
              />
              {showHashtagSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden z-10">
                  {filteredSuggestions.slice(0, 5).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => addHashtag(tag)}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
            <div className="flex items-center gap-4">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">📸 Đăng ảnh</button>
              {isProcessingImages && <span className="text-[10px] font-black text-emerald-600 animate-pulse uppercase tracking-widest">⚡ Đang tối ưu ảnh...</span>}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={onImageChange} />
            <LoadingButton onClick={onCreate} variant="primary" size="sm" loadingText="Đang đăng..." className="!px-6"
              disabled={isProcessingImages || (!inputText.trim() && selectedImages.length === 0)}
            >
              Chia sẻ
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(PostCreator);