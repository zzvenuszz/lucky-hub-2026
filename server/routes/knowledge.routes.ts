import { Router, Request, Response } from 'express';
import { Knowledge } from '../models/Knowledge.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';
import { importKnowledgeDocument } from '../services/knowledgeDocumentService.ts';
import { callAIEmbeddings } from '../services/ai/oaiRouter.ts';
import { invalidateKnowledgeRetrievalCache } from '../services/knowledgeRetrievalService.ts';
import { scanKnowledgeConflicts } from '../services/knowledgeConflictService.ts';
import { createKnowledgeDocumentImportJob, getKnowledgeDocumentImportJob, runKnowledgeDocumentImportJob } from '../services/knowledgeImportJobService.ts';
import { AITrainingReview } from '../models/AITrainingReview.ts';
import { normalizeKnowledgeTags } from '../services/knowledgeTagService.ts';

const router = Router();
router.use(authMiddleware);

const normalizeTagKey = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

async function removeTrainingTagIfUnused(knowledgeIds: unknown[], topic: string, exceptReviewId?: string): Promise<void> {
  const tagKey = normalizeTagKey(topic);
  for (const rawId of knowledgeIds) {
    const id = String(rawId);
    const otherReviews = await AITrainingReview.find({
      ...(exceptReviewId ? { _id: { $ne: exceptReviewId } } : {}),
      status: 'approved',
      approvedKnowledgeIds: id,
    }).select('approvedTopic').lean().exec();
    if (otherReviews.some(review => normalizeTagKey(review.approvedTopic || '') === tagKey)) continue;
    const entry = await Knowledge.findById(id);
    if (!entry) continue;
    const remainingTags = (entry.tags || []).filter(tag => normalizeTagKey(tag) !== tagKey);
    if (remainingTags.length === (entry.tags || []).length) continue;
    entry.tags = normalizeKnowledgeTags(remainingTags);
    await entry.save();
  }
}

function validTrainingTopic(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.trim().length <= 42 && value.trim().split(/\s+/).length <= 4;
}

function getReviewKnowledgeIds(review: any): string[] {
  return (review.suggestedKnowledgeIds || []).map(String);
}

function getApprovedKnowledgeIds(review: any): string[] {
  return (review.approvedKnowledgeIds || []).map(String);
}

async function pruneTrainingReferences(removedKnowledgeIds: string[]): Promise<{ updated: number; deleted: number }> {
  const removedIds = new Set(removedKnowledgeIds);
  if (!removedIds.size) return { updated: 0, deleted: 0 };
  const relatedReviews = await AITrainingReview.find({
    $or: [
      { suggestedKnowledgeIds: { $in: Array.from(removedIds) } },
      { approvedKnowledgeIds: { $in: Array.from(removedIds) } },
    ],
  });
  let deleted = 0;
  for (const review of relatedReviews) {
    review.suggestedKnowledgeIds = review.suggestedKnowledgeIds.filter(id => !removedIds.has(String(id))) as any;
    review.approvedKnowledgeIds = review.approvedKnowledgeIds.filter(id => !removedIds.has(String(id))) as any;
    const noActiveAssociations = review.status === 'approved'
      ? review.approvedKnowledgeIds.length === 0
      : review.suggestedKnowledgeIds.length === 0;
    if (noActiveAssociations) {
      await review.deleteOne();
      deleted += 1;
    } else {
      await review.save();
    }
  }
  return { updated: relatedReviews.length - deleted, deleted };
}

// GET /api/knowledge
router.get('/', async (req: Request, res: Response) => {
  const data = await Knowledge.find();
  res.json(data.map(i => ({ ...i.toObject(), id: i._id })));
});

// POST /api/knowledge/scan-conflicts
router.post('/scan-conflicts', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user?.userId || 'admin');
    const result = await scanKnowledgeConflicts(userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[KnowledgeConflict] Scan failed:', error?.message || error);
    res.status(500).json({ message: error?.message || 'Không thể rà soát xung đột kiến thức.' });
  }
});

router.get('/training/reviews', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending';
    const reviews = await AITrainingReview.find({ status }).sort({ createdAt: -1 }).limit(100).lean().exec();
    res.json(reviews.map(review => ({
      ...review,
      id: String(review._id),
      suggestedKnowledgeIds: (review.suggestedKnowledgeIds || []).map(String),
      approvedKnowledgeIds: (review.approvedKnowledgeIds || []).map(String),
    })));
  } catch (error: any) {
    console.error('[AITrainingReview] Queue load failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể tải hàng chờ duyệt.' });
  }
});

router.post('/normalize-tags', requirePermission(RESOURCES.AI.MANAGE), async (_req: Request, res: Response) => {
  try {
    const entries = await Knowledge.find({ tags: { $exists: true, $ne: [] } }).select('keyword tags').exec();
    let updated = 0;
    for (const entry of entries) {
      const tags = normalizeKnowledgeTags(entry.tags, entry.keyword);
      if (JSON.stringify(tags) === JSON.stringify(entry.tags || [])) continue;
      entry.tags = tags;
      await entry.save();
      updated += 1;
    }
    invalidateKnowledgeRetrievalCache();
    console.log('[Knowledge] Existing tags normalized:', { scanned: entries.length, updated });
    res.json({ success: true, scanned: entries.length, updated });
  } catch (error: any) {
    console.error('[Knowledge] Existing tag normalization failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể chuẩn hóa tag hiện có.' });
  }
});

router.patch('/training/reviews/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const { decision, topic, knowledgeIds } = req.body || {};
  if (!['approve', 'reject', 'update'].includes(decision)) return res.status(400).json({ message: 'Quyết định duyệt không hợp lệ.' });
  try {
    const review = await AITrainingReview.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy đề xuất training.' });
    if (decision === 'approve' && review.status !== 'pending') return res.status(409).json({ message: 'Đề xuất này đã được xử lý.' });
    if (decision === 'update' && review.status !== 'approved') return res.status(409).json({ message: 'Chỉ có thể sửa mục đã duyệt.' });
    if (decision === 'reject') {
      if (review.status !== 'pending') return res.status(409).json({ message: 'Chỉ có thể bỏ qua đề xuất đang chờ duyệt.' });
      review.status = 'rejected';
      review.reviewedBy = String(req.user?.userId || '');
      review.reviewedAt = new Date();
      await review.save();
      invalidateKnowledgeRetrievalCache();
      console.log('[AITrainingReview] Proposal rejected:', { id: review.id, reviewer: review.reviewedBy });
      return res.json({ success: true, status: review.status });
    }

    const approvedTopic = typeof topic === 'string' ? topic.trim().replace(/^#+/, '').replace(/\s+/g, ' ') : '';
    if (!validTrainingTopic(approvedTopic)) {
      return res.status(400).json({ message: 'Chủ đề cần ngắn tối đa 4 từ và 42 ký tự.' });
    }
    const proposedIds = new Set(getReviewKnowledgeIds(review));
    const approvedIds = Array.isArray(knowledgeIds)
      ? Array.from(new Set(knowledgeIds.filter((id: unknown): id is string => typeof id === 'string' && proposedIds.has(id))))
      : [];
    if (!approvedIds.length) return res.status(400).json({ message: 'Hãy chọn ít nhất một mục kiến thức liên quan.' });

    const previousTopic = review.approvedTopic;
    const previousIds = getApprovedKnowledgeIds(review);
    if (decision === 'update' && previousTopic) {
      const removeIds = previousIds.filter(id => previousTopic !== approvedTopic || !approvedIds.includes(id));
      await removeTrainingTagIfUnused(removeIds, previousTopic, String(review._id));
    }
    const entries = await Knowledge.find({ _id: { $in: approvedIds } });
    if (entries.length !== approvedIds.length) return res.status(409).json({ message: 'Một số mục kiến thức đã bị xóa. Hãy tải lại danh sách rồi duyệt lại.' });
    for (const entry of entries) {
      entry.tags = normalizeKnowledgeTags([approvedTopic, ...(entry.tags || [])]);
      await entry.save();
    }
    review.status = 'approved';
    review.approvedTopic = approvedTopic;
    review.approvedKnowledgeIds = entries.map(entry => entry._id);
    review.reviewedBy = String(req.user?.userId || '');
    review.reviewedAt = new Date();
    await review.save();
    invalidateKnowledgeRetrievalCache();
    console.log(`[AITrainingReview] Proposal ${decision === 'update' ? 'updated' : 'approved'} and feedback applied:`, { id: review.id, topic: approvedTopic, knowledge: entries.length, reviewer: review.reviewedBy });
    res.json({ success: true, status: review.status, topic: approvedTopic, appliedTo: entries.length });
  } catch (error: any) {
    console.error('[AITrainingReview] Proposal update failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể cập nhật đề xuất training.' });
  }
});

router.delete('/training/reviews/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const review = await AITrainingReview.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy mục training.' });
    if (review.status === 'approved' && review.approvedTopic) {
      await removeTrainingTagIfUnused(getApprovedKnowledgeIds(review), review.approvedTopic, String(review._id));
    }
    await review.deleteOne();
    invalidateKnowledgeRetrievalCache();
    console.log('[AITrainingReview] Training item deleted:', { id: String(review._id), status: review.status });
    res.json({ success: true });
  } catch (error: any) {
    console.error('[AITrainingReview] Training item deletion failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể xóa mục training.' });
  }
});

// POST /api/knowledge
router.post('/', requirePermission(RESOURCES.AI.MANAGE), validateBody(
  { field: 'keyword', type: 'string', required: true, max: 200 },
  { field: 'content', type: 'string', required: true, max: 5000 }
), async (req: Request, res: Response) => {
  console.log('[Knowledge] Manual entry save started:', { keyword: req.body.keyword, category: req.body.category || 'general' });
  const k = new Knowledge({ ...req.body, tags: normalizeKnowledgeTags(req.body.tags, String(req.body.keyword || '')) });
  try {
    const result = await callAIEmbeddings(`knowledge-save-${Date.now().toString(36)}`, [String(req.body.content)], (req as any).user?.userId || 'admin');
    k.embedding = result.embeddings[0];
    k.embeddingModel = `${result.providerUsed || ''}:${result.modelUsed || ''}`;
  } catch (error: any) {
    console.warn('[Knowledge] Embedding unavailable; entry will use lexical retrieval:', error?.message || error);
  }
  await k.save();
  invalidateKnowledgeRetrievalCache();
  console.log('[Knowledge] Manual entry saved:', { id: k._id.toString(), embedded: !!k.embedding });
  const savedEntry: any = k.toObject();
  delete savedEntry.embedding;
  res.json({ ...savedEntry, id: k._id });
});

// POST /api/knowledge/import-document (new document ingestion endpoint)
router.post('/import-document/jobs', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const body = req.body || {};
  const userId = String((req as any).user?.userId || 'admin');
  try {
    const jobId = await createKnowledgeDocumentImportJob(userId, String(body.fileName || 'tai-lieu'));
    res.status(202).json({ success: true, jobId, status: 'queued' });
    setImmediate(() => {
      void runKnowledgeDocumentImportJob(jobId, {
        fileName: String(body.fileName || ''),
        mimeType: String(body.mimeType || ''),
        base64: String(body.base64 || ''),
        category: String(body.category || 'general'),
        userId,
      }).catch(error => {
        console.error('[Knowledge] Background document import worker failed:', { jobId, message: error?.message || error, stack: error?.stack });
      });
    });
  } catch (error: any) {
    console.error('[Knowledge] Could not create document import job:', { userId, fileName: body.fileName, message: error?.message || error });
    res.status(500).json({ message: 'Không thể khởi tạo tác vụ nhập tài liệu.' });
  }
});

// GET /api/knowledge/import-document/jobs/:jobId
router.get('/import-document/jobs/:jobId', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.jobId)) return res.status(404).json({ message: 'Không tìm thấy tác vụ nhập tài liệu.' });
  const userId = String((req as any).user?.userId || 'admin');
  const job = await getKnowledgeDocumentImportJob(req.params.jobId, userId);
  if (!job) return res.status(404).json({ message: 'Không tìm thấy tác vụ nhập tài liệu.' });
  res.json({
    jobId: String(job._id),
    fileName: job.fileName,
    status: job.status,
    stage: job.stage,
    pageNumber: job.pageNumber,
    totalPages: job.totalPages,
    percent: job.percent,
    message: job.message,
    error: job.error,
    result: job.result,
    logs: job.logs,
    updatedAt: job.updatedAt,
  });
});

router.post('/import-document', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).slice(2, 10).toUpperCase();
  try {
    const { fileName, mimeType, base64, category } = req.body || {};
    console.log('[Knowledge] Document import request received:', { requestId, fileName: String(fileName || ''), mimeType, payloadChars: String(base64 || '').length });
    const result = await importKnowledgeDocument({
      fileName: String(fileName || ''),
      mimeType: String(mimeType || ''),
      base64: String(base64 || ''),
      category: String(category || 'general'),
      userId: String((req as any).user?.userId || 'admin'),
      requestId,
    });
    invalidateKnowledgeRetrievalCache();
    res.json({ success: true, requestId, ...result });
  } catch (error: any) {
    console.error('[Knowledge] Document import failed:', { requestId, name: error?.name, message: error?.message, stack: error?.stack, cause: error?.cause?.message });
    const rawMessage = String(error?.message || 'Không thể nhập tài liệu.');
    const message = rawMessage.includes('The string did not match the expected pattern')
      ? 'Bộ đọc không xử lý được cấu trúc hoặc font trong PDF này. Hãy thử lưu lại thành PDF chuẩn hoặc chuyển trang bị lỗi thành ảnh. '
      : rawMessage;
    const statusCode = /timeout|hết thời gian/i.test(rawMessage) ? 504 : 400;
    res.status(statusCode).json({ requestId, message });
  }
});

// DELETE /api/knowledge/document/:documentId (new bulk delete endpoint)
router.delete('/document/:documentId', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const entries = await Knowledge.find({ documentId: req.params.documentId }).select('_id').lean().exec();
    const training = await pruneTrainingReferences(entries.map(entry => String(entry._id)));
    const result = await Knowledge.deleteMany({ documentId: req.params.documentId });
    invalidateKnowledgeRetrievalCache();
    console.log('[Knowledge] Source document and linked training removed:', { documentId: req.params.documentId, deletedCount: result.deletedCount || 0, updatedTraining: training.updated, deletedTraining: training.deleted });
    res.json({ success: true, deletedCount: result.deletedCount || 0, removedTraining: training.deleted, updatedTraining: training.updated });
  } catch (error: any) {
    console.error('[Knowledge] Source document deletion failed:', { documentId: req.params.documentId, message: error?.message || error });
    res.status(500).json({ message: 'Không thể xóa tài liệu và dữ liệu training liên quan.' });
  }
});

// PUT /api/knowledge/:id
router.put('/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const { keyword, content, category, tags } = req.body || {};
  if (typeof keyword !== 'string' || !keyword.trim() || keyword.trim().length > 200) {
    return res.status(400).json({ message: 'Tên kiến thức không hợp lệ.' });
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 5000) {
    return res.status(400).json({ message: 'Nội dung kiến thức không hợp lệ.' });
  }
  const allowedCategories = ['nutrition', 'meal_plan', 'exercise', 'health_advice', 'disease', 'general'];
  if (category && !allowedCategories.includes(category)) return res.status(400).json({ message: 'Danh mục kiến thức không hợp lệ.' });
  const cleanTags = Array.isArray(tags)
    ? normalizeKnowledgeTags(tags, keyword.trim())
    : [];

  try {
    const entry = await Knowledge.findById(req.params.id).select('+embedding');
    if (!entry) return res.status(404).json({ message: 'Không tìm thấy kiến thức.' });
    const contentChanged = entry.content !== content.trim();
    entry.keyword = keyword.trim();
    entry.content = content.trim();
    entry.category = category || 'general';
    entry.tags = cleanTags;
    if (contentChanged) {
      try {
        const result = await callAIEmbeddings(`knowledge-update-${Date.now().toString(36)}`, [entry.content], (req as any).user?.userId || 'admin');
        entry.embedding = result.embeddings[0];
        entry.embeddingModel = `${result.providerUsed || ''}:${result.modelUsed || ''}`;
      } catch (error: any) {
        entry.embedding = undefined;
        entry.embeddingModel = '';
        console.warn('[Knowledge] Updated content saved without embedding:', error?.message || error);
      }
    }
    await entry.save();
    invalidateKnowledgeRetrievalCache();
    const savedEntry: any = entry.toObject();
    delete savedEntry.embedding;
    console.log('[Knowledge] Entry updated:', { id: entry._id.toString(), contentChanged, tagCount: cleanTags.length });
    res.json({ ...savedEntry, id: entry._id });
  } catch (error: any) {
    console.error('[Knowledge] Entry update failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể cập nhật kiến thức.' });
  }
});

// DELETE /api/knowledge/:id
router.delete('/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const entry = await Knowledge.findById(req.params.id).select('_id');
    if (!entry) return res.status(404).json({ message: 'Không tìm thấy kiến thức.' });
    const training = await pruneTrainingReferences([String(entry._id)]);
    await entry.deleteOne();
    invalidateKnowledgeRetrievalCache();
    console.log('[Knowledge] Entry and linked training removed:', { id: String(entry._id), deletedTraining: training.deleted, updatedTraining: training.updated });
    res.json({ success: true, removedTraining: training.deleted, updatedTraining: training.updated });
  } catch (error: any) {
    console.error('[Knowledge] Entry deletion failed:', { id: req.params.id, message: error?.message || error });
    res.status(500).json({ message: 'Không thể xóa kiến thức.' });
  }
});

export default router;
