
import React, { useState, useCallback, memo } from 'react';
import Cropper from 'react-easy-crop';

interface AvatarEditorProps {
  currentAvatar: string;
  gender: 'Nam' | 'Nữ';
  fullName: string;
  onAvatarChange: (newAvatar: string) => void;
}

const AvatarEditor: React.FC<AvatarEditorProps> = ({ currentAvatar, gender, fullName, onAvatarChange }) => {
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const getDisplayAvatar = () => {
    if (currentAvatar) return currentAvatar;
    return gender === 'Nữ'
      ? `https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=f8fafc`
      : `https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=f8fafc`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImageToCrop(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const onCropComplete = useCallback((_area: any, pixels: any) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSaveCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      const image = new Image();
      image.src = imageToCrop;
      await new Promise(resolve => { image.onload = resolve; });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 400; canvas.height = 400;
      ctx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, 400, 400);
      onAvatarChange(canvas.toDataURL('image/jpeg', 0.8));
      setImageToCrop(null);
    }
  };

  return (
    <div className="shrink-0" data-testid="profile-avatar-editor">
      <label className="relative cursor-pointer group block" title="Thay đổi ảnh đại diện">
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl border-4 border-white shadow-xl overflow-hidden bg-white ring-1 ring-slate-200/60">
          <img src={getDisplayAvatar()} alt={fullName} className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-lg">📸</div>
        <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-emerald-600 text-xs text-white shadow-md">📷</span>
        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
      </label>

      {imageToCrop && (
        <div className="fixed inset-0 bg-slate-900/90 z-[1001] flex flex-col p-4 sm:p-10 animate-in fade-in">
          <div className="relative flex-grow bg-slate-800 rounded-[2rem] overflow-hidden">
            <Cropper image={imageToCrop} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
          </div>
          <div className="mt-6 flex flex-col gap-4 max-w-md mx-auto w-full">
            <div className="flex gap-4">
              <button type="button" onClick={() => setImageToCrop(null)} className="flex-1 py-4 bg-slate-700 text-white rounded-2xl font-black uppercase text-[10px]">Hủy</button>
              <button type="button" onClick={handleSaveCrop} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px]">Cắt & Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

AvatarEditor.displayName = 'AvatarEditor';

export default memo(AvatarEditor);
