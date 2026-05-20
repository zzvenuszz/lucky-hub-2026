import { Router, Request, Response } from 'express';
import { Chat } from '../models/Chat.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/chats
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const chats = await Chat.find({
    $or: [{ memberId: userId }, { coachId: userId }]
  });
  res.json(chats);
});

// POST /api/chats
router.post('/', async (req: Request, res: Response) => {
  const { id, ...data } = req.body;
  const chat = await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true });
  res.json(chat);
});

// PUT /api/chats/:id/clear
router.put('/:id/clear', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const chat = await Chat.findOneAndUpdate({ id }, { $set: { messages: [] } }, { new: true });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;