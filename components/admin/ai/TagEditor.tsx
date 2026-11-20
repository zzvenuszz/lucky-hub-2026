import React, { memo, useCallback, useState } from 'react';

interface TagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

const normalizeTags = (tags: string[]): string[] => Array.from(new Set(
  tags.map(tag => tag.trim().replace(/^#+/, '').slice(0, 40)).filter(Boolean),
)).slice(0, 20);

const TagEditor: React.FC<TagEditorProps> = ({ value, onChange, placeholder = 'Nhập tag rồi nhấn Enter hoặc dấu phẩy' }) => {
  const [draft, setDraft] = useState('');
  const addDraft = useCallback(() => {
    const additions = normalizeTags(draft.split(/[;,\n]/));
    if (additions.length) onChange(normalizeTags([...value, ...additions]));
    setDraft('');
  }, [draft, onChange, value]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addDraft();
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }, [addDraft, draft, onChange, value]);

  return <div className="min-h-12 w-full rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100 focus-within:ring-emerald-400">
    <div className="flex flex-wrap items-center gap-2">
      {value.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
        #{tag}<button type="button" onClick={() => onChange(value.filter(item => item !== tag))} aria-label={`Xóa tag ${tag}`} className="text-emerald-400 hover:text-rose-600">×</button>
      </span>)}
      <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown} onBlur={addDraft} placeholder={placeholder} className="min-w-[180px] flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-slate-400" />
    </div>
  </div>;
};

export default memo(TagEditor);
TagEditor.displayName = 'TagEditor';
