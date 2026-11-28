import React, { memo, useCallback, useEffect, useState } from 'react';
import { AIKnowledge } from '../../../types.ts';
import { AITrainingReview, Database } from '../../../services/database.ts';

interface AITrainingReviewPanelProps {
  knowledge: AIKnowledge[];
}

const AITrainingReviewPanel: React.FC<AITrainingReviewPanelProps> = memo(({ knowledge }) => {
  const [reviews, setReviews] = useState<AITrainingReview[]>([]);
  const [queueStatus, setQueueStatus] = useState<'pending' | 'approved'>('pending');
  const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
  const [selectedKnowledge, setSelectedKnowledge] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const result = await Database.getAITrainingReviews(queueStatus);
      setReviews(result || []);
      setSelectedTopics(current => Object.fromEntries((result || []).map(item => [item.id, current[item.id] || item.approvedTopic || item.topics[0]?.label || ''])));
      setSelectedKnowledge(current => Object.fromEntries((result || []).map(item => [item.id, current[item.id] ?? (item.status === 'approved' ? item.approvedKnowledgeIds : [])])));
      setError('');
    } catch (loadError: any) {
      console.error('[AITrainingReviewPanel] Failed to load proposals:', loadError?.message || loadError);
      setError(loadError?.message || 'Không tải được danh sách đề xuất.');
    } finally {
      setLoading(false);
    }
  }, [queueStatus]);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  const handleReview = useCallback(async (review: AITrainingReview, decision: 'approve' | 'reject' | 'update') => {
    setBusyId(review.id);
    try {
      await Database.reviewAITrainingProposal(review.id, {
        decision,
        topic: selectedTopics[review.id],
        knowledgeIds: selectedKnowledge[review.id] || [],
      });
      console.log('[AITrainingReviewPanel] Proposal reviewed:', { reviewId: review.id, decision });
      if (decision === 'update') {
        setReviews(current => current.map(item => item.id === review.id ? { ...item, approvedTopic: selectedTopics[review.id], approvedKnowledgeIds: selectedKnowledge[review.id] || [] } : item));
      } else {
        setReviews(current => current.filter(item => item.id !== review.id));
      }
      setError('');
    } catch (reviewError: any) {
      console.error('[AITrainingReviewPanel] Proposal review failed:', reviewError?.message || reviewError);
      setError(reviewError?.message || 'Không thể lưu kết quả duyệt.');
    } finally {
      setBusyId('');
    }
  }, [selectedKnowledge, selectedTopics]);

  const handleDelete = useCallback(async (review: AITrainingReview) => {
    if (!window.confirm('Xóa mục training này? Tag liên quan sẽ được gỡ khỏi kiến thức nếu không còn mục training nào khác sử dụng.')) return;
    setBusyId(review.id);
    try {
      await Database.deleteAITrainingReview(review.id);
      setReviews(current => current.filter(item => item.id !== review.id));
      console.log('[AITrainingReviewPanel] Training item deleted:', { reviewId: review.id });
      setError('');
    } catch (deleteError: any) {
      console.error('[AITrainingReviewPanel] Training item deletion failed:', deleteError?.message || deleteError);
      setError(deleteError?.message || 'Không thể xóa mục training.');
    } finally {
      setBusyId('');
    }
  }, []);

  const toggleKnowledge = useCallback((reviewId: string, knowledgeId: string) => {
    setSelectedKnowledge(current => {
      const selected = current[reviewId] || [];
      return { ...current, [reviewId]: selected.includes(knowledgeId) ? selected.filter(id => id !== knowledgeId) : [...selected, knowledgeId] };
    });
  }, []);

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-800">Training thủ công · duyệt chủ đề chat</h3>
          <p className="mt-1 text-xs text-slate-500">Điểm phần trăm là mức phù hợp do hệ thống xếp hạng, chưa phải xác suất thống kê.</p>
        </div>
        <button type="button" onClick={() => void loadReviews()} disabled={loading} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Làm mới</button>
      </div>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setQueueStatus('pending')} className={`rounded-xl px-3 py-2 text-xs font-black ${queueStatus === 'pending' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Chờ duyệt</button>
        <button type="button" onClick={() => setQueueStatus('approved')} className={`rounded-xl px-3 py-2 text-xs font-black ${queueStatus === 'approved' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Đã huấn luyện</button>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</div>}
      {loading ? <div className="py-8 text-center text-sm text-slate-400">Đang tải đề xuất…</div> : reviews.length === 0 ? <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{queueStatus === 'pending' ? 'Chưa có đề xuất chờ duyệt. Đề xuất sẽ xuất hiện khi AI truy xuất được kiến thức cho câu chat.' : 'Chưa có mục training nào được duyệt.'}</div> : (
        <div className="space-y-4">
          {reviews.map(review => {
            const selectedIds = selectedKnowledge[review.id] || [];
            return (
              <article key={review.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{new Date(review.createdAt).toLocaleString()}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-800">{review.query}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {review.topics.map(candidate => <button key={candidate.label} type="button" onClick={() => setSelectedTopics(current => ({ ...current, [review.id]: candidate.label }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selectedTopics[review.id] === candidate.label ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>{candidate.label} · {candidate.score}%</button>)}
                </div>
                <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">Chủ đề đã xác nhận (tối đa 4 từ)</label>
                <input value={selectedTopics[review.id] || ''} onChange={event => setSelectedTopics(current => ({ ...current, [review.id]: event.target.value }))} maxLength={42} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                <div className="mt-3 space-y-2">
                  {review.suggestedKnowledgeIds.map(id => {
                    const item = knowledge.find(entry => String(entry.id) === id);
                    return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleKnowledge(review.id, id)} className="mt-0.5" /><span><b>{item?.keyword || 'Kiến thức đã truy xuất'}</b>{item?.source && <span className="ml-1 text-slate-400">· {item.source}{item.pageNumber ? `, trang ${item.pageNumber}` : ''}</span>}<span className="mt-1 block text-slate-500">{item?.content?.slice(0, 220) || ''}</span></span></label>;
                  })}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  {review.status === 'approved' ? <>
                    <button type="button" disabled={busyId === review.id} onClick={() => void handleDelete(review)} className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-black text-rose-700 disabled:opacity-50">Xóa training</button>
                    <button type="button" disabled={busyId === review.id || !selectedIds.length} onClick={() => void handleReview(review, 'update')} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busyId === review.id ? 'Đang lưu…' : 'Lưu chỉnh sửa'}</button>
                  </> : <>
                    <button type="button" disabled={busyId === review.id} onClick={() => void handleReview(review, 'reject')} className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-black text-rose-700 disabled:opacity-50">Bỏ qua</button>
                    <button type="button" disabled={busyId === review.id || !selectedIds.length} onClick={() => void handleReview(review, 'approve')} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busyId === review.id ? 'Đang lưu…' : 'Duyệt và áp dụng'}</button>
                  </>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
});

AITrainingReviewPanel.displayName = 'AITrainingReviewPanel';
export default AITrainingReviewPanel;
