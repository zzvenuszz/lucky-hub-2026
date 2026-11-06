
import React, { useState, memo, useCallback } from 'react';
import { User, HealthGoal } from '../../types.ts';
import LoadingButton from '../system/LoadingButton.tsx';
import { useToast } from '../system/ToastProvider.tsx';

interface ProfileFormProps {
  user: User;
  initialData: any;
  canManageMemberLevel?: boolean;
  onMemberLevelUpdate?: (memberLevel: string) => Promise<void>;
  /**
   * PHÂN TÍCH: Cần mở rộng kiểu của onUpdate để chấp nhận tham số thứ 2 (shouldSubmit)
   * nhằm tương thích với logic cập nhật tức thì (false) và cập nhật khi submit (true/mặc định).
   */
  onUpdate: (data: any, shouldSubmit?: boolean) => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ user, initialData, onUpdate, canManageMemberLevel = false, onMemberLevelUpdate }) => {
  const [formData, setFormData] = useState(initialData);
  const [memberLevelDraft, setMemberLevelDraft] = useState<string>(user.memberLevel || 'customer');
  const [savingMemberLevel, setSavingMemberLevel] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();

  // Đồng bộ formData khi initialData thay đổi (ví dụ khi AvatarEditor cập nhật avatar)
  React.useEffect(() => {
    setFormData(initialData);
  }, [initialData]);
  React.useEffect(() => { setMemberLevelDraft(user.memberLevel || 'customer'); }, [user.memberLevel]);

  const saveMemberLevel = useCallback(async () => {
    if (!onMemberLevelUpdate) return;
    if (memberLevelDraft !== 'customer' && !user.memberNumber) {
      addToast({ type: 'warning', title: 'Chưa thể đổi cấp độ', message: 'Hồ sơ cần có mã hội viên hợp lệ trước.' });
      return;
    }
    setSavingMemberLevel(true);
    try {
      await onMemberLevelUpdate(memberLevelDraft);
      addToast({ type: 'success', title: 'Đã cập nhật', message: 'Cấp độ hội viên đã được lưu.' });
    } catch (error: any) {
      console.error('[ProfileForm] Member level update failed:', error);
      addToast({ type: 'error', title: 'Không thể cập nhật', message: error?.message || 'Có lỗi khi cập nhật cấp độ.' });
    } finally { setSavingMemberLevel(false); }
  }, [onMemberLevelUpdate, memberLevelDraft, user.memberNumber, addToast]);

  const checkEmailExists = async (email: string) => {
    if (email === user.email) { 
      setEmailError(null); 
      return; 
    }
    try {
      console.log(`[ProfileForm] Checking email availability: ${email}`);
      const res = await fetch('/api/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, excludeUserId: (user as any).id || (user as any)._id })
      });
      const data = await res.json();
      if (data.exists) {
        console.warn(`[ProfileForm] Email already exists: ${email}`);
        setEmailError('Email này đã được sử dụng');
      } else {
        console.log(`[ProfileForm] Email is available: ${email}`);
        setEmailError(null);
      }
    } catch (error) {
      console.error('[ProfileForm] Error checking email:', error);
      setEmailError('Không thể kiểm tra email, vui lòng thử lại');
    }
  };

  const handleSubmit = useCallback(async () => {
    if (emailError) {
      console.warn('[ProfileForm] Cannot submit - email error exists');
      addToast({ type: 'warning', title: 'Không thể lưu', message: 'Vui lòng sửa lỗi email trước khi lưu.' });
      return;
    }
    setIsSubmitting(true);
    console.log('[ProfileForm] Submitting form with data:', { fullName: formData.fullName, email: formData.email });
    try {
      await onUpdate(formData);
      addToast({ type: 'success', title: 'Thành công', message: 'Hồ sơ đã được cập nhật.' });
      console.log('[ProfileForm] Update successful');
    } catch (error: any) {
      console.error('[ProfileForm] Update failed:', error);
      addToast({ type: 'error', title: 'Lỗi', message: error?.message || 'Có lỗi xảy ra khi cập nhật hồ sơ.' });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, emailError, onUpdate, addToast]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-6 sm:p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Họ và tên</label>
          {/* SỬA LỖI: Truyền false cho shouldSubmit để chỉ cập nhật state cục bộ ở component cha mà không gọi API ngay */}
          <input required type="text" value={formData.fullName} onChange={e => { const d = {...formData, fullName: e.target.value}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Email</label>
          <input required type="email" value={formData.email} onBlur={() => checkEmailExists(formData.email)} onChange={e => setFormData({...formData, email: e.target.value})} className={`w-full px-4 py-3 rounded-xl border-2 outline-none text-sm font-medium ${emailError ? 'border-rose-400 bg-rose-50/10' : 'border-transparent bg-slate-50 focus:border-emerald-500'}`} />
          {emailError && <p className="text-[9px] text-rose-500 font-bold ml-1">{emailError}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Số điện thoại</label>
          {/* SỬA LỖI: Truyền false cho shouldSubmit */}
          <input required type="tel" value={formData.phoneNumber} onChange={e => { const d = {...formData, phoneNumber: e.target.value}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Địa chỉ</label>
          <input required type="text" value={formData.address || ''} onChange={e => { const d = {...formData, address: e.target.value}; setFormData(d); onUpdate(d, false); }} placeholder="Địa chỉ nhận hàng / liên hệ" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mã hội viên Herbalife</label>
          <input type="text" value={formData.memberNumber || ''} onChange={e => { const d = {...formData, memberNumber: e.target.value.toUpperCase()}; setFormData(d); onUpdate(d, false); }} placeholder="VA12345678 hoặc VNY1234567" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
          <p className="text-[10px] text-slate-400 ml-1">Để trống nếu chưa có thẻ hội viên.</p>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mã người bảo trợ</label>
          <input type="text" value={formData.sponsorMemberNumber || ''} onChange={e => { const d = {...formData, sponsorMemberNumber: e.target.value.toUpperCase()}; setFormData(d); onUpdate(d, false); }} placeholder="Mã hội viên người giới thiệu" className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Cấp độ hội viên</label>
          {canManageMemberLevel ? <><select value={memberLevelDraft} onChange={e => setMemberLevelDraft(e.target.value)} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent outline-none text-sm font-medium"><option value="customer">Khách hàng</option><option value="member">Hội viên</option><option value="senior_consultant">Tư vấn viên cao cấp</option><option value="success_builder">Nhà kiến tạo thành công</option><option value="supervisor">Giám sát viên</option></select><button type="button" onClick={saveMemberLevel} disabled={savingMemberLevel || memberLevelDraft === (user.memberLevel || 'customer')} className="mt-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{savingMemberLevel ? 'Đang lưu…' : 'Lưu cấp độ'}</button></> : <><input readOnly value={({ customer: 'Khách hàng', member: 'Hội viên', senior_consultant: 'Tư vấn viên cao cấp', success_builder: 'Nhà kiến tạo thành công', supervisor: 'Giám sát viên' } as any)[user.memberLevel || 'customer']} className="w-full px-4 py-3 bg-slate-100 rounded-xl border border-transparent outline-none text-sm font-medium text-slate-500" /><p className="text-[10px] text-slate-400 ml-1">Cấp độ do người có quyền trong tuyến trên quản lý.</p></>}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Chiều cao (CM)</label>
          <input required type="number" inputMode="numeric" value={formData.height} onChange={e => { const d = {...formData, height: Number(e.target.value)}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Giới tính</label>
          <select value={formData.gender} onChange={e => { const d = {...formData, gender: e.target.value as 'Nam'|'Nữ'}; setFormData(d); onUpdate(d, false); }} className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-transparent focus:border-emerald-500 outline-none text-sm font-medium">
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-bold text-slate-500 ml-1 uppercase">Mục tiêu sức khỏe (Chọn nhiều mục)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-slate-50 rounded-xl">
            {Object.values(HealthGoal).map(goal => (
              <label key={goal} className="flex items-center space-x-3 cursor-pointer hover:bg-white/50 p-2 rounded-lg transition-colors">
                <input 
                  type="checkbox" 
                  checked={(formData.healthGoals || []).includes(goal)} 
                  onChange={e => {
                    const currentGoals = formData.healthGoals || [];
                    const newGoals = e.target.checked 
                      ? [...currentGoals, goal]
                      : currentGoals.filter((g: string) => g !== goal);
                    const d = {...formData, healthGoals: newGoals};
                    setFormData(d);
                    onUpdate(d, false);
                  }}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-sm font-medium text-slate-700">{goal}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <LoadingButton type="button" onClick={handleSubmit} disabled={isSubmitting} variant="primary" size="lg" loadingText="Đang lưu..." className="!w-full">
        Cập nhật hồ sơ hội viên
      </LoadingButton>
    </form>
  );
};

export default memo(ProfileForm);
