import React, { memo, useMemo, useState } from 'react';

interface BranchNutritionGroupEditorProps {
  mode: 'create' | 'edit';
  group?: any;
  coachCandidates: any[];
  isSaving: boolean;
  onSave: (data: { name: string; ownerId: string; ownerName: string; address: string; isActive: boolean }) => void;
  onDelete?: (group: any) => void;
  onClose: () => void;
}

const BranchNutritionGroupEditor: React.FC<BranchNutritionGroupEditorProps> = memo(({ mode, group, coachCandidates, isSaving, onSave, onDelete, onClose }) => {
  const initialOwnerId = String(group?.ownerId?._id || group?.ownerId || '');
  const [name, setName] = useState(String(group?.name || ''));
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [address, setAddress] = useState(String(group?.address || ''));
  const [isActive, setIsActive] = useState(group?.isActive !== false);
  const selectedOwner = useMemo(() => coachCandidates.find(candidate => String(candidate.id || candidate._id) === ownerId), [coachCandidates, ownerId]);

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="branch-ndd-editor-title" className="max-h-[calc(100dvh-24px)] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <header>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">NDD trong nhánh</p>
          <h3 id="branch-ndd-editor-title" className="mt-1 text-xl font-black text-slate-800">{mode === 'create' ? 'Tạo nhóm dinh dưỡng' : `Sửa NDD: ${group?.name || ''}`}</h3>
        </header>

        <label className="block text-xs font-bold text-slate-600">Tên NDD
          <input value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800" />
        </label>

        <label className="block text-xs font-bold text-slate-600">Chủ vận hành
          <select value={ownerId} onChange={event => setOwnerId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <option value="">-- Chọn HLV vận hành --</option>
            {coachCandidates.map(candidate => {
              const id = String(candidate.id || candidate._id);
              return <option key={id} value={id}>{candidate.fullName} (@{candidate.username})</option>;
            })}
          </select>
          {coachCandidates.length === 0 && <span className="mt-1 block text-xs font-medium text-rose-600">Chưa có người dùng được cấp quyền Vận hành NDD.</span>}
        </label>

        <label className="block text-xs font-bold text-slate-600">Địa chỉ
          <input value={address} onChange={event => setAddress(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800" />
        </label>

        {mode === 'edit' && <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} /> Đang hoạt động
        </label>}

        <footer className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
          <div>{mode === 'edit' && onDelete && <button type="button" onClick={() => onDelete(group)} disabled={isSaving} className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 disabled:opacity-50">Xóa NDD</button>}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-600">Hủy</button>
            <button type="button" onClick={() => onSave({ name: name.trim(), ownerId, ownerName: selectedOwner?.fullName || group?.ownerName || '', address: address.trim(), isActive })} disabled={isSaving || !name.trim() || !ownerId} className="rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{isSaving ? 'Đang lưu…' : mode === 'create' ? 'Tạo NDD' : 'Lưu thay đổi'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
});

BranchNutritionGroupEditor.displayName = 'BranchNutritionGroupEditor';
export default BranchNutritionGroupEditor;
