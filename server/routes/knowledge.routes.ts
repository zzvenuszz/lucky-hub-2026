import { Router, Request, Response } from 'express';
import { Knowledge } from '../models/Knowledge.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';
import { importKnowledgeDocument } from '../services/knowledgeDocumentService.ts';
import { callAIEmbeddings } from '../services/ai/oaiRouter.ts';
import { invalidateKnowledgeRetrievalCache } from '../services/knowledgeRetrievalService.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/knowledge
router.get('/', async (req: Request, res: Response) => {
  const data = await Knowledge.find();
  res.json(data.map(i => ({ ...i.toObject(), id: i._id })));
});

// POST /api/knowledge
router.post('/', requirePermission(RESOURCES.AI.MANAGE), validateBody(
  { field: 'keyword', type: 'string', required: true, max: 200 },
  { field: 'content', type: 'string', required: true, max: 5000 }
), async (req: Request, res: Response) => {
  console.log('[Knowledge] Manual entry save started:', { keyword: req.body.keyword, category: req.body.category || 'general' });
  const k = new Knowledge(req.body);
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
router.post('/import-document', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { fileName, mimeType, base64, category } = req.body || {};
    const result = await importKnowledgeDocument({
      fileName: String(fileName || ''),
      mimeType: String(mimeType || ''),
      base64: String(base64 || ''),
      category: String(category || 'general'),
      userId: String((req as any).user?.userId || 'admin'),
    });
    invalidateKnowledgeRetrievalCache();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[Knowledge] Document import failed:', error?.message || error);
    res.status(400).json({ message: error?.message || 'Không thể nhập tài liệu.' });
  }
});

// DELETE /api/knowledge/document/:documentId (new bulk delete endpoint)
router.delete('/document/:documentId', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const result = await Knowledge.deleteMany({ documentId: req.params.documentId });
  invalidateKnowledgeRetrievalCache();
  console.log('[Knowledge] Source document deleted:', { documentId: req.params.documentId, deletedCount: result.deletedCount || 0 });
  res.json({ success: true, deletedCount: result.deletedCount || 0 });
});

// DELETE /api/knowledge/:id
router.delete('/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  invalidateKnowledgeRetrievalCache();
  res.json({ success: true });
});

export default router;
