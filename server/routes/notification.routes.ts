import { Router, Request, Response } from 'express';
import { Notification } from '../models/Notification.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { logger } from '../../src/utils/logger.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/notifications/:userId
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const notifications = await Notification.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications.map(n => ({ ...n.toObject(), id: n._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, type, message, link } = req.body;
    const notif = new Notification({ userId, type, message, link, read: false });
    await notif.save();
    logger.info('NOTIFICATION', `Created notification for user ${userId}: ${message.substring(0, 50)}`);
    res.json({ ...notif.toObject(), id: notif._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/read-all/:userId
router.put('/read-all/:userId', async (req: Request, res: Response) => {
  try {
    await Notification.updateMany({ userId: req.params.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;