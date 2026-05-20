import { Router, Request, Response } from 'express';
import { Rule } from '../models/Rule.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/rules
router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await Rule.find();
    res.json(data.map(i => ({ ...i.toObject(), id: i._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/rules
router.post('/', requirePermission(RESOURCES.AI.MANAGE), validateBody(
  { field: 'content', type: 'string', required: true, max: 5000 }
), async (req: Request, res: Response) => {
  try {
    const r = new Rule(req.body);
    await r.save();
    res.json({ ...r.toObject(), id: r._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/rules/:id
router.delete('/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    await Rule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
