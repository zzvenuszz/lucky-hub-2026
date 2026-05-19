/**
 * MessageInput - Input chat với emoji picker, attachment, voice
 */
import React, { useState, useRef, useCallback, memo } from 'react';

interface MessageInputProps {
  onSend: (text: string, imageBase64?: string) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

const EMOJI_QUICK = ['😊', '👍', '❤️', '😂', '🔥', '💪', '🎉', '🙏', '😍', '👏', '🤔', '✨'];

const MessageInput: React.FC<MessageInputProps> = memo(({ onSend, onTyping, disabled }) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const typingTimeout = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      onTyping(false);
    }, 1500);
  }, [onTyping]);

  const handleSend = useCallback(async () => {
    if ((!inputText.trim() && !selectedImage) || disabled || isProcessing) return;
    setIsProcessing(true);
    try {
      await onSend(inputText, selectedImage || undefined);
      setInputText('');
      setSelectedImage(null);
      onTyping(false);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, selectedImage, disabled, isProcessing, onSend, onTyping]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleEmojiClick = useCallback((emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmoji(false);
    onTyping(true);
  }, [onTyping]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setSelectedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  return (
    <div className="p-4 bg-white border-t border-slate-50">
      {selectedImage && (
        <div className="relative w-12 h-12 mb-2 inline-block">
          <img src={selectedImage} className="w-full h-full object-cover rounded-lg" alt="Preview" />
          <button onClick={() => setSelectedImage(null)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center">×</button>
        </div>
      )}
      {showEmoji && (
        <div className="mb-2 p-2 bg-slate-50 rounded-xl flex flex-wrap gap-1">
          {EMOJI_QUICK.map(emoji => (
            <button key={emoji} onClick={() => handleEmojiClick(emoji)} className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-lg transition-all text-lg">{emoji}</button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-all shrink-0" title="Đính kèm ảnh">📸</button>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
        <button onClick={() => setShowEmoji(!showEmoji)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0 ${showEmoji ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 hover:bg-slate-100'}`} title="Emoji">😊</button>
        <input placeholder="Nhập tin nhắn..." value={inputText} onChange={handleChange} onKeyDown={handleKeyDown} disabled={disabled || isProcessing} className="flex-grow px-4 bg-slate-50 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50" />
        <button onClick={handleSend} disabled={(!inputText.trim() && !selectedImage) || disabled || isProcessing} className="bg-emerald-600 text-white w-10 h-10 rounded-xl shadow-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0">
          {isProcessing ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🚀'}
        </button>
      </div>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;