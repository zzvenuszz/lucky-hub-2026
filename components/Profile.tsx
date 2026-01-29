
import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { User, HealthGoal, UserRole } from '../types.ts';
import BadgeDisplay from './BadgeDisplay.tsx';

interface ProfileProps {
  user: User;
  onUpdate: (data: Partial<User>) => void;
  onNavigateToAdmin?: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdate, onNavigateToAdmin }) => {
  const [formData, setFormData] = useState({
    fullName: user.fullName,
    height: user.height,
    weight: user.weight || 0,
    phoneNumber: user.phoneNumber || '',
    healthGoal: user.healthGoal,
    avatar: user.avatar || '',
    gender: user.gender
  });

  // State cho việc cắt ảnh
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const getAvatar = () => {
    if (formData.avatar) return formData.avatar;
    return formData.gender === 'Nữ'
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
    e.target.value = ''; // Reset input
  };

  const onCropComplete = useCallback((_area: any, pixels: any) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return '';

    // Kích thước chuẩn cho Avatar để tối ưu dung lượng
    const targetSize = 400;
    canvas.width = targetSize;
    canvas.height = targetSize;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      targetSize,
      targetSize
    );

    // Nén ảnh chất lượng 0.8
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleSaveCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      try {
        const croppedImg = await getCroppedImg(imageToCrop, croppedAreaPixels);
        setFormData({ ...formData, avatar: croppedImg });
        setImageToCrop(null);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(formData);
    alert('Đã cập nhật thông tin thành công!');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {user.role === UserRole.ADMIN && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-amber-200">🛡️</div>
            <div>
              <h4 className="font-black text-amber-800 text-sm uppercase tracking-widest">Quản trị viên</h4>
              <p className="text-xs text-amber-600 font-medium">Bạn có quyền truy cập hệ thống quản trị.</p>
            </div>
          </div>
          <button onClick={onNavigateToAdmin} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md">Admin Panel</button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="bg-emerald-600 h-32 relative">
          <div className="absolute -bottom-12 left-8">
            <label className="relative cursor-pointer group block">
              <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-white">
                <img src={getAvatar()} alt={user.fullName} className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">📸</div>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 pt-16 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-800">{user.fullName}</h3>
                <BadgeDisplay badgeIds={user.badges} size="md" />
              </div>
              <p className="text-xs text-slate-400 font-medium">Hành trình của bạn tại Lucky Hub</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Họ và tên</label>
              <input required type="text" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Số điện thoại</label>
              <input required type="tel" value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Chiều cao (CM)</label>
              <input required type="number" value={formData.height} onChange={e => setFormData({...formData, height: Number(e.target.value)})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mục tiêu sức khỏe</label>
              <select value={formData.healthGoal} onChange={e => setFormData({...formData, healthGoal: e.target.value as HealthGoal})} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 focus:bg-white outline-none transition-all text-sm font-medium">
                {Object.values(HealthGoal).map(goal => <option key={goal} value={goal}>{goal}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button type="submit" className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-[0.98] transition-all">
              Cập nhật hồ sơ hội viên
            </button>
          </div>
        </form>
      </div>

      {/* Modal Cắt ảnh */}
      {imageToCrop && (
        <div className="fixed inset-0 bg-slate-900/90 z-[1001] flex flex-col p-4 sm:p-10 animate-in fade-in duration-300">
          <div className="relative flex-grow bg-slate-800 rounded-[2rem] overflow-hidden">
            <Cropper
              image={imageToCrop}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="mt-6 flex flex-col gap-4 max-w-md mx-auto w-full">
            <div className="flex items-center gap-4 text-white">
              <span className="text-xs font-black uppercase tracking-widest">Phóng to:</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-grow accent-emerald-500"
              />
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setImageToCrop(null)} 
                className="flex-1 py-4 bg-slate-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveCrop} 
                className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-900/20"
              >
                Cắt & Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
