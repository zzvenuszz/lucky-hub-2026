import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIKnowledge } from '../../../types.ts';
import { Database, KnowledgeDocumentImportJob } from '../../../services/database.ts';
import TagEditor from './TagEditor.tsx';
import KnowledgeEntryEditor from './KnowledgeEntryEditor.tsx';

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
const ACTIVE_IMPORT_JOB_KEY = 'lucky_hub_knowledge_import_job';
const getKnowledgeId = (item: AIKnowledge): string => item.id || String((item as any)._id || '');

const wait = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms));

async function watchKnowledgeDocumentImportJob(
  jobId: string,
  onProgress: (job: KnowledgeDocumentImportJob) => void,
  shouldContinue: () => boolean = () => true,
): Promise<KnowledgeDocumentImportJob | null> {
  let consecutiveErrors = 0;
  while (shouldContinue()) {
    let job: KnowledgeDocumentImportJob | null;
    try {
      job = await Database.getKnowledgeDocumentImportJob(jobId);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      if (/Lỗi API 404/.test(String((error as any)?.message || error))) throw error;
      if (consecutiveErrors >= 10) throw error;
      await wait(3000);
      continue;
    }
    if (!job) throw new Error(`Không tìm thấy trạng thái tác vụ nhập ${jobId}.`);
    onProgress(job);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await wait(5000);
  }
  return null;
}

interface KnowledgeScanPair {
  first: AIKnowledge;
  second: AIKnowledge;
  reason: string;
  score: number;
}

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp.'));
  reader.onerror = () => reject(reader.error || new Error('Không đọc được tệp.'));
  reader.readAsDataURL(file);
});

const KnowledgeManager: React.FC<KnowledgeManagerProps> = ({ knowledge, onRefresh }) => {
  const [newK, setNewK] = useState({ keyword: '', content: '', category: 'general', tags: [] as string[] });
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploading, setUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState('');
  const [expandedDocumentId, setExpandedDocumentId] = useState('');
  const [editingEntry, setEditingEntry] = useState<AIKnowledge | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [scanningConflicts, setScanningConflicts] = useState(false);
  const [scanResults, setScanResults] = useState<{ scanned: number; candidates: number; conflicts: KnowledgeScanPair[]; similar: KnowledgeScanPair[] } | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [importProgress, setImportProgress] = useState<KnowledgeDocumentImportJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const finishImportJob = useCallback((job: KnowledgeDocumentImportJob) => {
    localStorage.removeItem(ACTIVE_IMPORT_JOB_KEY);
    if (job.status === 'failed') {
      setStatus({ text: job.error || job.message || 'Không thể nhập tài liệu.', error: true });
      window.debugLog?.(`[KnowledgeDocument] Nhập thất bại: ${job.error || job.message}`, 'error');
      return;
    }
    const result = job.result;
    if (!result) {
      setStatus({ text: 'Tác vụ kết thúc nhưng máy chủ không trả kết quả nhập.', error: true });
      return;
    }
    if (result.alreadyImported) {
      const reindexMessage = result.reindexed ? ` Đã lập chỉ mục ngữ nghĩa cho ${result.reindexed} đoạn còn thiếu.` : '';
      const resynthesisMessage = result.needsResynthesis ? ' Bản hiện tại được nhập bằng cách trích chữ cũ; hãy xóa tài liệu này rồi nhập lại để tạo kiến thức tổng hợp.' : '';
      setStatus({ text: `Tài liệu ${result.source} đã được nhập trước đó; không tạo bản trùng.${resynthesisMessage}${reindexMessage}`, error: false });
      console.log('[KnowledgeManager] Duplicate document confirmed in database; knowledge list refreshed:', { source: result.source, reindexed: result.reindexed });
    } else {
      const embeddedMessage = result.embedded ? ` ${result.embedded} đoạn đã lập chỉ mục ngữ nghĩa.` : ' Đang dùng tìm kiếm từ khóa; bật tác vụ Embedding trong Quản trị AI để dùng tìm kiếm ngữ nghĩa.';
      const synthesizedMessage = typeof result.synthesized === 'number' ? ` AI đã tổng hợp ${result.synthesized}/${result.inserted} đoạn thành kiến thức có ngữ cảnh.` : '';
      setStatus({ text: `Đã nhập ${result.inserted} đoạn từ ${result.source}.${synthesizedMessage}${embeddedMessage}`, error: false });
      window.debugLog?.(`[KnowledgeDocument] Nhập xong: ${result.inserted} đoạn, tổng hợp AI ${result.synthesized || 0} đoạn, mã ${job.jobId}.`, 'system');
      console.log('[KnowledgeManager] Document upload completed:', { jobId: job.jobId, ...result });
    }
    setScanResults(null);
    onRefresh();
  }, [onRefresh]);

  const finishImportJobRef = useRef(finishImportJob);
  finishImportJobRef.current = finishImportJob;

  useEffect(() => {
    const jobId = localStorage.getItem(ACTIVE_IMPORT_JOB_KEY);
    if (!jobId) return;
    let active = true;
    setUploading(true);
    watchKnowledgeDocumentImportJob(jobId, job => {
      if (active) setImportProgress(job);
    }, () => active).then(job => {
      if (active && job) finishImportJobRef.current(job);
    }).catch(error => {
      if (active) {
        if (/Lỗi API 404|Không tìm thấy trạng thái tác vụ/.test(String(error?.message || error))) localStorage.removeItem(ACTIVE_IMPORT_JOB_KEY);
        setStatus({ text: error?.message || 'Không thể lấy tiến độ nhập tài liệu.', error: true });
      }
    }).finally(() => {
      if (active) setUploading(false);
    });
    return () => { active = false; };
  }, []);

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
      setNewK({ keyword: '', content: '', category: 'general', tags: [] });
      setScanResults(null);
      setStatus({ text: 'Đã lưu kiến thức.', error: false });
      onRefresh();
    } catch (error: any) {
      console.error('[KnowledgeManager] Manual entry save failed:', error);
      setStatus({ text: error?.message || 'Không thể lưu kiến thức.', error: true });
    }
  }, [newK, onRefresh]);

  const handleSaveEntry = useCallback(async (entry: AIKnowledge) => {
    const id = getKnowledgeId(entry);
    if (!id) return;
    setSavingEntry(true);
    try {
      console.log('[KnowledgeManager] Knowledge edit started:', { id, tagCount: entry.tags?.length || 0 });
      await Database.updateKnowledge(id, entry);
      setEditingEntry(null);
      setScanResults(null);
      setStatus({ text: 'Đã cập nhật nội dung và tag kiến thức.', error: false });
      onRefresh();
    } catch (error: any) {
      console.error('[KnowledgeManager] Knowledge edit failed:', error);
      setStatus({ text: error?.message || 'Không thể cập nhật kiến thức.', error: true });
    } finally {
      setSavingEntry(false);
    }
  }, [onRefresh]);

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
    setImportProgress(null);
    setStatus({ text: 'Đang tải tài liệu lên để bắt đầu tác vụ nhập…', error: false });
    window.debugLog?.('[KnowledgeDocument] Bắt đầu nhập tài liệu.', 'system');
    console.log('[KnowledgeManager] Document upload started:', { fileName: file.name, mimeType, bytes: file.size, category: uploadCategory });
    try {
      const dataUrl = await readFileAsDataUrl(file);
      window.debugLog?.(`[KnowledgeDocument] Đọc tệp thành công (${file.name}, ${file.size} bytes).`, 'system');
      window.debugLog?.('[KnowledgeDocument] Đang gửi tài liệu đến máy chủ để tạo tác vụ nhập.', 'system');
      const started = await Database.startKnowledgeDocumentImport({
        fileName: file.name,
        mimeType,
        base64: dataUrl.split(',')[1] || '',
        category: uploadCategory,
      });
      if (!started?.jobId) throw new Error('Máy chủ không tạo được tác vụ nhập tài liệu.');
      localStorage.setItem(ACTIVE_IMPORT_JOB_KEY, started.jobId);
      window.debugLog?.(`[KnowledgeDocument] Đã tạo tác vụ nhập ${started.jobId}.`, 'system');
      const job = await watchKnowledgeDocumentImportJob(started.jobId, setImportProgress);
      if (!job) throw new Error('Theo dõi tác vụ nhập đã bị gián đoạn.');
      finishImportJob(job);
    } catch (error: any) {
      console.error('[KnowledgeManager] Document upload failed:', error);
      window.debugLog?.(`[KnowledgeDocument] Nhập thất bại: ${error?.message || error}`, 'error');
      setStatus({ text: error?.message || 'Không thể nhập tài liệu.', error: true });
    } finally {
      setUploading(false);
    }
  }, [finishImportJob, uploadCategory]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Xác nhận xóa kiến thức này?')) return;
    try {
      await Database.deleteKnowledge(id);
      setScanResults(null);
      onRefresh();
    } catch (error: any) {
      setStatus({ text: error?.message || 'Không thể xóa kiến thức.', error: true });
    }
  }, [onRefresh]);

  const handleScanConflicts = useCallback(async () => {
    setScanningConflicts(true);
    setScanResults(null);
    setStatus({ text: 'Đang so sánh kiến thức và nhờ AI phân loại các cặp liên quan…', error: false });
    console.log('[KnowledgeManager] Conflict scan started:', { knowledgeCount: knowledge.length });
    try {
      const result = await Database.scanKnowledgeConflicts();
      setScanResults(result);
      setStatus({ text: `Đã rà soát ${result.scanned} mục, đối chiếu ${result.candidates} cặp tiềm năng; phát hiện ${result.conflicts.length} cặp cần xem xét và ${result.similar.length} cặp tương tự.`, error: false });
      console.log('[KnowledgeManager] Conflict scan completed:', { scanned: result.scanned, candidates: result.candidates, conflicts: result.conflicts.length, similar: result.similar.length });
    } catch (error: any) {
      console.error('[KnowledgeManager] Conflict scan failed:', error);
      setStatus({ text: error?.message || 'Không thể rà soát xung đột kiến thức.', error: true });
    } finally {
      setScanningConflicts(false);
    }
  }, [knowledge]);

  const handleDeleteDocument = useCallback(async (documentId: string, source: string) => {
    if (!confirm(`Xóa toàn bộ kiến thức được nhập từ “${source}”?`)) return;
    setBusyDocumentId(documentId);
    try {
      await Database.deleteKnowledgeDocument(documentId);
      setScanResults(null);
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
          <TagEditor value={newK.tags} onChange={tags => setNewK(current => ({ ...current, tags }))} />
          <textarea placeholder="Nội dung AI trả lời..." value={newK.content} onChange={e => setNewK({ ...newK, content: e.target.value })} className="w-full px-4 py-3 rounded-xl text-sm h-32 bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500 resize-none" />
        </div>
        <button onClick={handleAdd} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Lưu kiến thức</button>

        <div className="border-t border-emerald-100 pt-4 space-y-3">
          <div className="text-xs font-black text-emerald-800">Nhập tài liệu để chatbot tra cứu</div>
          <div className="text-[11px] leading-relaxed text-emerald-900/70">PDF, JPG, PNG hoặc WEBP · tối đa 10 MB. PDF tối đa 200 trang; trang có hình ảnh được nhận diện lần lượt và hiển thị tiến độ. Tài liệu được trích xuất, chia đoạn và lập chỉ mục; đây là Knowledge Base, không phải fine-tuning mô hình.</div>
          <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm bg-white shadow-sm border-none outline-none focus:ring-1 focus:ring-emerald-500">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleUpload} className="hidden" />
          <button disabled={uploading} onClick={() => fileInputRef.current?.click()} className="w-full py-4 bg-white text-emerald-700 border border-emerald-200 rounded-2xl font-black uppercase text-[10px] shadow-sm disabled:opacity-50">
            {uploading ? 'Đang xử lý tài liệu…' : '⬆️ Tải PDF / hình ảnh'}
          </button>
          {importProgress && <div className="rounded-xl border border-emerald-100 bg-white p-3 space-y-2" role="status" aria-live="polite">
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-emerald-800">
              <span>{importProgress.message}</span>
              <span className="shrink-0">{importProgress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-emerald-50" role="progressbar" aria-label="Tiến độ nhập tài liệu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={importProgress.percent}>
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${importProgress.percent}%` }} />
            </div>
            {importProgress.totalPages > 0 && <div className="text-[9px] text-slate-500">Trang {importProgress.pageNumber}/{importProgress.totalPages} · {importProgress.fileName}</div>}
          </div>}
        </div>
        {status && <div role="status" className={`rounded-xl px-4 py-3 text-xs font-bold ${status.error ? 'bg-rose-50 text-rose-700' : 'bg-white text-emerald-700'}`}>{status.text}</div>}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-4">
          <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Kho kiến thức ({knowledge.length})</h4>
          <button type="button" disabled={scanningConflicts || !knowledge.length} onClick={handleScanConflicts} className="shrink-0 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black uppercase disabled:opacity-50">
            {scanningConflicts ? 'Đang rà soát…' : '🔎 Rà soát xung đột'}
          </button>
        </div>
        {scanResults && <div className="space-y-3">
          {!!scanResults.conflicts.length && <div className="space-y-2">
            <div className="px-4 text-[10px] font-black uppercase tracking-widest text-rose-600">Cần review xung đột ({scanResults.conflicts.length})</div>
            {scanResults.conflicts.map((pair, index) => <div key={`conflict-${pair.first.id}-${pair.second.id}-${index}`} className="rounded-2xl border-2 border-rose-400 bg-rose-50/60 p-4 space-y-3">
              <div className="text-[11px] font-bold text-rose-800">{pair.reason}</div>
              {[pair.first, pair.second].map(item => <div key={item.id} className="rounded-xl bg-white/80 p-3 flex items-start gap-2">
                <div className="min-w-0 flex-1"><div className="font-black text-xs text-slate-800">{item.keyword}</div><div className="mt-1 text-[11px] text-slate-600 whitespace-pre-wrap">{item.content}</div>{!!item.tags?.length && <div className="mt-2 flex flex-wrap gap-1">{item.tags.map(tag => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500">#{tag}</span>)}</div>}</div>
                <button type="button" onClick={() => handleDelete(item.id)} className="shrink-0 rounded-lg px-2 py-1 text-[9px] font-bold text-rose-600 hover:bg-rose-100">Xóa mục này</button>
              </div>)}
            </div>)}
          </div>}
          {!!scanResults.similar.length && <div className="space-y-2">
            <div className="px-4 text-[10px] font-black uppercase tracking-widest text-emerald-700">Nội dung tương tự ({scanResults.similar.length})</div>
            {scanResults.similar.map((pair, index) => <div key={`similar-${pair.first.id}-${pair.second.id}-${index}`} className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/50 p-4 space-y-2">
              <div className="text-[10px] font-bold text-emerald-800">{pair.reason}</div>
              {[pair.first, pair.second].map(item => <div key={item.id} className="rounded-xl bg-white/80 p-3"><div className="font-black text-xs text-slate-800">{item.keyword}</div><div className="mt-1 text-[11px] text-slate-600 line-clamp-4 whitespace-pre-wrap">{item.content}</div></div>)}
            </div>)}
          </div>}
          {!scanResults.conflicts.length && !scanResults.similar.length && <div className="mx-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">Không tìm thấy cặp kiến thức liên quan cần review trong {scanResults.scanned} mục.</div>}
        </div>}
      </div>

      <div className="space-y-4">
        <h4 className="font-black text-slate-400 uppercase tracking-widest text-[10px] ml-4">Tài liệu đã nhập ({documents.length})</h4>
        <div className="max-h-[70vh] overflow-y-auto no-scrollbar space-y-3">
          {documents.map(document => (
            <div key={document.documentId} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate font-black text-emerald-600 text-xs">📄 {document.source}</div>
                <div className="text-[10px] text-slate-500">{document.chunks.length} đoạn · {new Set(document.chunks.map(item => item.pageNumber).filter(Boolean)).size || 1} trang · {CATEGORIES.find(([value]) => value === document.category)?.[1] || 'Kiến thức chung'}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-2">{document.chunks[0]?.content}</div>
                <button type="button" onClick={() => setExpandedDocumentId(current => current === document.documentId ? '' : document.documentId)} className="pt-2 text-[10px] font-black text-emerald-700">{expandedDocumentId === document.documentId ? 'Thu gọn các đoạn' : `Xem / sửa ${document.chunks.length} đoạn kiến thức`}</button>
                {expandedDocumentId === document.documentId && <div className="mt-2 max-h-80 space-y-2 overflow-y-auto border-t border-slate-100 pt-2">
                  {document.chunks.map(chunk => <div key={getKnowledgeId(chunk)} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-bold text-[11px] text-slate-700">{chunk.keyword} · trang {chunk.pageNumber || 1}</div><div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600">{chunk.content}</div></div><button type="button" onClick={() => setEditingEntry(chunk)} className="shrink-0 text-[10px] font-black text-emerald-700">Sửa</button></div>
                    {!!chunk.tags?.length && <div className="mt-2 flex flex-wrap gap-1">{chunk.tags.map(tag => <span key={tag} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] text-emerald-700">#{tag}</span>)}</div>}
                  </div>)}
                </div>}
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
            <div key={getKnowledgeId(item)} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start group hover:border-emerald-200 transition-all">
              <div className="space-y-1 min-w-0">
                <div className="font-black text-emerald-600 text-xs uppercase tracking-tight">{item.keyword}</div>
                <div className="text-[10px] text-slate-400">{CATEGORIES.find(([value]) => value === item.category)?.[1] || 'Kiến thức chung'}</div>
                <div className="text-[11px] text-slate-600 leading-relaxed italic line-clamp-3">{item.content}</div>
                {!!item.tags?.length && <div className="flex flex-wrap gap-1 pt-1">{item.tags.map(tag => <span key={tag} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">#{tag}</span>)}</div>}
              </div>
              <div className="flex shrink-0 items-center"><button type="button" onClick={() => setEditingEntry(item)} className="p-2 text-emerald-600 hover:bg-emerald-50" aria-label="Sửa kiến thức">✏️</button><button onClick={() => handleDelete(getKnowledgeId(item))} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">🗑️</button></div>
            </div>
          ))}
        </div>
      </div>
      {editingEntry && <KnowledgeEntryEditor key={getKnowledgeId(editingEntry)} entry={editingEntry} saving={savingEntry} onSave={handleSaveEntry} onCancel={() => setEditingEntry(null)} />}
    </div>
  );
};

export default memo(KnowledgeManager);
KnowledgeManager.displayName = 'KnowledgeManager';
