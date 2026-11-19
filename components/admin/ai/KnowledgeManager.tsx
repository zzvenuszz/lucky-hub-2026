import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { AIKnowledge } from '../../../types.ts';
import { Database } from '../../../services/database.ts';

interface KnowledgeManagerProps {
  knowledge: AIKnowledge[];
  onRefresh: () => void;
}

const CATEGORIES = [
  ['general', 'Kiến thức chung'],
  ['nutrition', 'Dinh dưỡng'],
  ['meal_plan', 'Thực đơn'],
  ['exercise', 'Tập luyện'],
  ['health_advice', 'Sức khỏe'],
  ['disease', 'Bệnh lý'],
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp.'));
  reader.onerror = () => reject(new Error('Không đọc được tệp.'));
  reader.readAsDataURL(file);
});

const KnowledgeManager: React.FC<KnowledgeManagerProps> = ({ knowledge, onRefresh }) => {
  const [newK, setNewK] = useState({ keyword: '', content: '', category: 'general' });
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState('');
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents = useMemo(() => {
    const groups = new Map<string, { documentId: string; source: string; category: string; chunks: AIKnowledge[] }>();
    knowledge.filter(item => item.documentId).forEach(item => {
      const documentId = item.documentId as string;
      const group = groups.get(documentId) || { documentId, source: item.source || item.keyword, category: item.category || 'general', chunks: [] };
      group.chunks.push(item);
      groups.set(documentId, group);
    });
    return Array.from(groups.values());
  }, [knowledge]);
  const manualEntries = useMemo(() => knowledge.filter(item => !item.documentId), [knowledge]);

  const handleAdd = useCallback(async () => {
    if (!newK.keyword.trim() || !newK.content.trim()) return;
    try {
      console.log('[KnowledgeManager] Manual entry save started:', { keyword: newK.keyword, category: newK.category });
      await Database.addKnowledge(newK);
      setNewK({ keyword: '', content: '', category: 'general' });
      setStatus({ text: 'Đã lưu kiến thức.', error: false });
      onRefresh();
    } catch (error: any) {
      console.error('[KnowledgeManager] Manual entry save failed:', error);
      setStatus({ text: error?.message || 'Không thể lưu kiến thức.', error: true });
    }
  }, [newK, onRefresh]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      setStatus({ text: 'Chỉ hỗ trợ PDF, JPG, PNG hoặc WEBP.', error: true });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ text: 'Tệp vượt quá giới hạn 10 MB.', error: true });
      return;
    }
    setUploading(true);
    setStatus({ text: 'Đang đọc, phân đoạn và lập chỉ mục tài liệu…', error: false });
    console.log('[KnowledgeManager] Document upload started:', { fileName: file.name, mimeType, bytes: file.size, category: uploadCategory });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await Database.importKnowledgeDocument({
        fileName: file.name,
        mimeType,
        base64: dataUrl.split(',')[1] || '',
        category: uploadCategory,
      });
      if (result?.alreadyImported) {
        const reindexMessage = result.reindexed ? ` Đã lập chỉ mục ngữ nghĩa cho ${result.reindexed} đoạn còn thiếu.` : '';
        setStatus({ text: `Tài liệu ${result.source} đã được nhập trước đó; không tạo bản trùng.${reindexMessage}`, error: false });
        return;
      }
      const embeddedMessage = result?.embedded ? ` ${result.embedded} đoạn đã lập chỉ mục ngữ nghĩa.` : ' Đang dùng tìm kiếm từ khóa; bật tác vụ Embedding trong Quản trị AI để dùng tìm kiếm ngữ nghĩa.';
      setStatus({ text: `Đã nhập ${result?.inserted || 0} đoạn từ ${result?.source || file.name}.${embeddedMessage}`, error: false });
      console.log('[KnowledgeManager] Document upload completed:', result);
      onRefresh();
    } catch (error: any) {
      console.error('[KnowledgeManager] Document upload failed:', error);
      setStatus({ text: error?.message || 'Không thể nhập tài liệu.', error: true });
    } finally {
      setUploading(false);
    }
  }, [onRefresh, uploadCategory]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Xác nhận xóa kiến thức này?')) return;
    try {
      await Database.deleteKnowledge(id);
      onRefresh();
    } catch (error: any) {
      setStatus({ text: error?.message || 'Không thể xóa kiến thức.', error: true });
    }
  }, [onRefresh]);

  const handleDeleteDocument = useCallback(async (documentId: string, source: string) => {
    if (!confirm(`Xóa toàn bộ kiến thức được nhập từ “${source}”?`)) return;
    setBusyDocumentId(documentId);
    try {
      await Database.deleteKnowledgeDocument(documentId);
      console.log('[KnowledgeManager] Source document deleted:', { documentId, source });
      onRefresh();
    } catch (error: any) {
      setStatus({ text: error?.message || 'Không thể xóa tài liệu.', error: true });
    } finally {
      setBusyDocumentId('');
    }
  }, [onRefresh]);

  return (
    <div className="space-y-6">
      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
        <h4 className="font-black text-emerald-700 uppercase tracking-widest text-[11px] flex items-center gap-2"><span className="text-lg">📚</span> Thêm Kiến thức (Knowledge)</h4>
        <div className="space-y-3">
          <select value={newK.category} onChange={e => setNewK({ ...newK, category: e.target.value })} className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input placeholder="Từ khóa..." value={newK.keyword} onChange={e => setNewK({ ...newK, keyword: e.target.value })} className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500" />
          <textarea placeholder="Nội dung AI trả lời..." value={newK.content} onChange={e => setNewK({ ...newK, content: e.target.value })} className="w-full px-4 py-3 rounded-xl text-sm h-32 bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Lưu kiến thức</button>

        <div className="border-t border-emerald-100 pt-4 space-y-3">
          <div className="text-xs font-black text-emerald-800">Nhập tài liệu để chatbot tra cứu</div>
          <div className="text-[11px] leading-relaxed text-emerald-900/70">PDF, JPG, PNG hoặc WEBP · tối đa 10 MB. Mỗi PDF tối đa 200 trang, trong đó tối đa 24 trang cần OCR. Tài liệu được trích xuất, chia đoạn và lập chỉ mục; đây là Knowledge Base, không phải fine-tuning mô hình.</div>
          <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" />
          <button disabled={uploading} onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-white text-emerald-700 border border-emerald-200 rounded-2xl font-black uppercase text-[10px] shadow-sm disabled:opacity-50">
            {uploading ? 'Đang xử lý tài liệu…' : '⬆️ Tải PDF / hình ảnh'}
          </button>
        </div>
        {status && <div role="status" className={`rounded-xl px-4 py-3 text-xs font-bold ${status.error ? 'bg-rose-50 text-rose-700' : 'bg-white text-emerald-700'}`}>{status.text}</div>}
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Tài liệu đã nhập ({documents.length})</h4>
        <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-3">
          {documents.map(document => (
            <div key={document.documentId} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start gap-3">
              <div className="min-w-0 space-y-1">
                <div className="truncate font-black text-emerald-600 text-xs">📄 {document.source}</div>
                <div className="text-[10px] text-slate-500">{document.chunks.length} đoạn · {new Set(document.chunks.map(item => item.pageNumber).filter(Boolean)).size || 1} trang · {CATEGORIES.find(([value]) => value === document.category)?.[1] || 'Kiến thức chung'}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-2">{document.chunks[0]?.content}</div>
              </div>
              <button disabled={busyDocumentId === document.documentId} onClick={() => handleDeleteDocument(document.documentId, document.source)} className="shrink-0 p-2 text-slate-300 hover:text-rose-500 disabled:opacity-50" aria-label={`Xóa ${document.source}`}>🗑️</button>
            </div>
          ))}
          {!documents.length && <div className="px-4 text-[11px] text-slate-400">Chưa có tài liệu nào.</div>}
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Kiến thức nhập tay ({manualEntries.length})</h4>
        <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3">
          {manualEntries.map(item => (
            <div key={item.id || (item as any)._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-emerald-200 transition-all">
              <div className="space-y-1 min-w-0">
                <div className="font-black text-emerald-600 text-xs uppercase tracking-tight">{item.keyword}</div>
                <div className="text-[10px] text-slate-400">{CATEGORIES.find(([value]) => value === item.category)?.[1] || 'Kiến thức chung'}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">{item.content}</div>
              </div>
              <button onClick={() => handleDelete(item.id || (item as any)._id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(KnowledgeManager);
KnowledgeManager.displayName = 'KnowledgeManager';
