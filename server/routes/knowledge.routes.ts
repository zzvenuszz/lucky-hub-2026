import { Router, Request, Response } from 'express';
import { Knowledge } from '../models/Knowledge.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';

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
  const k = new Knowledge(req.body);
  await k.save();
  res.json({ ...k.toObject(), id: k._id });
});

// DELETE /api/knowledge/:id
router.delete('/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default router;