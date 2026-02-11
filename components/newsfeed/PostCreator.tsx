
import React, { useRef, memo } from 'react';
import { User } from '../../types.ts';

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
}

const PostCreator: React.FC<PostCreatorProps> = ({ 
  currentUser, inputText, setInputText, selectedImages, setSelectedImages, 
  isProcessingImages, isLoading, onCreate, onImageChange 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
            <div className="flex items-center gap-4">
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all">📸 Đăng ảnh</button>
              {isProcessingImages && <span className="text-[10px] font-black text-emerald-600 animate-pulse uppercase tracking-widest">⚡ Đang tối ưu ảnh...</span>}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={onImageChange} />
            <button onClick={onCreate} disabled={isLoading || isProcessingImages || (!inputText.trim() && selectedImages.length === 0)} className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50">
              {isLoading ? 'Đang đăng...' : 'Chia sẻ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(PostCreator);
