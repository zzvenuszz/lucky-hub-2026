import React, { memo, useCallback, useState } from 'react';
import { AIKnowledge } from '../../../types.ts';
import TagEditor from './TagEditor.tsx';

interface KnowledgeEntryEditorProps {
  entry: AIKnowledge;
  saving: boolean;
  onSave: (entry: AIKnowledge) => void;
  onCancel: () => void;
}

const CATEGORIES = [
  ['general', 'Kiến thức chung'], ['nutrition', 'Dinh dưỡng'], ['meal_plan', 'Thực đơn'],
  ['exercise', 'Tập luyện'], ['health_advice', 'Sức khỏe'], ['disease', 'Bệnh lý'],
];

const KnowledgeEntryEditor: React.FC<KnowledgeEntryEditorProps> = ({ entry, saving, onSave, onCancel }) => {
  const [draft, setDraft] = useState<AIKnowledge>({ ...entry, tags: entry.tags || [] });
  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.keyword.trim() || !draft.content.trim()) return;
    onSave({ ...draft, keyword: draft.keyword.trim(), content: draft.content.trim(), tags: draft.tags || [] });
  }, [draft, onSave]);

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between gap-4"><h3 className="font-black text-slate-800">Sửa kiến thức</h3><button type="button" onClick={onCancel} className="text-2xl leading-none text-slate-400">×</button></div>
      <input value={draft.keyword} onChange={event => setDraft(current => ({ ...current, keyword: event.target.value }))} maxLength={200} placeholder="Tên chủ đề kiến thức" className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" />
      <select value={draft.category || 'general'} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} className="w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400">
        {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <TagEditor value={draft.tags || []} onChange={tags => setDraft(current => ({ ...current, tags }))} />
      <textarea value={draft.content} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} maxLength={5000} placeholder="Nội dung kiến thức" className="h-64 w-full resize-y rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-emerald-400" />
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl px-4 py-3 text-xs font-bold text-slate-500 hover:bg-slate-100">Hủy</button><button type="submit" disabled={saving || !draft.keyword.trim() || !draft.content.trim()} className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button></div>
    </form>
  </div>;
};

export default memo(KnowledgeEntryEditor);
KnowledgeEntryEditor.displayName = 'KnowledgeEntryEditor';
