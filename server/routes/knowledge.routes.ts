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
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Quyết định duyệt không hợp lệ.' });
  try {
    const review = await AITrainingReview.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Không tìm thấy đề xuất training.' });
    if (review.status !== 'pending') return res.status(409).json({ message: 'Đề xuất này đã được xử lý.' });
    if (decision === 'reject') {
      review.status = 'rejected';
      review.reviewedBy = String(req.user?.userId || '');
      review.reviewedAt = new Date();
      await review.save();
      invalidateKnowledgeRetrievalCache();
      console.log('[AITrainingReview] Proposal rejected:', { id: review.id, reviewer: review.reviewedBy });
      return res.json({ success: true, status: review.status });
    }

    const approvedTopic = typeof topic === 'string' ? topic.trim().replace(/^#+/, '').replace(/\s+/g, ' ') : '';
    if (!approvedTopic || approvedTopic.length > 42 || approvedTopic.split(/\s+/).length > 4) {
      return res.status(400).json({ message: 'Chủ đề cần ngắn tối đa 4 từ và 42 ký tự.' });
    }
    const proposedIds = new Set(review.suggestedKnowledgeIds.map(String));
    const approvedIds = Array.isArray(knowledgeIds)
      ? Array.from(new Set(knowledgeIds.filter((id: unknown): id is string => typeof id === 'string' && proposedIds.has(id))))
      : [];
    if (!approvedIds.length) return res.status(400).json({ message: 'Hãy chọn ít nhất một mục kiến thức liên quan.' });

    const entries = await Knowledge.find({ _id: { $in: approvedIds } });
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
    console.log('[AITrainingReview] Proposal approved and feedback applied:', { id: review.id, topic: approvedTopic, knowledge: entries.length, reviewer: review.reviewedBy });
    res.json({ success: true, status: review.status, topic: approvedTopic, appliedTo: entries.length });
  } catch (error: any) {
    console.error('[AITrainingReview] Proposal update failed:', error?.message || error);
    res.status(500).json({ message: 'Không thể cập nhật đề xuất training.' });
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
  const result = await Knowledge.deleteMany({ documentId: req.params.documentId });
  invalidateKnowledgeRetrievalCache();
  console.log('[Knowledge] Source document deleted:', { documentId: req.params.documentId, deletedCount: result.deletedCount || 0 });
  res.json({ success: true, deletedCount: result.deletedCount || 0 });
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
  await Knowledge.findByIdAndDelete(req.params.id);
  invalidateKnowledgeRetrievalCache();
  res.json({ success: true });
});

export default router;
