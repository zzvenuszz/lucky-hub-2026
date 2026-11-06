import { Router, Request, Response } from 'express';
import { Notification } from '../models/Notification.ts';
import { User } from '../models/User.ts';
import { publishNotification } from '../websocket/chatSocket.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { logger } from '../../src/utils/logger.ts';

const router = Router();
router.use(authMiddleware);

const DEFAULT_NOTIFICATION_PREFERENCES = { community: true, goals: true, metrics: true, system: true };

router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!.userId).select('notificationPreferences').lean();
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    res.json({ preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(user as any).notificationPreferences } });
  } catch (err: any) {
    logger.error('NOTIFICATION', `Error loading preferences for ${req.user!.userId}: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const allowed = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES);
    const input = req.body?.preferences;
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key) || typeof input[key] !== 'boolean')) {
      return res.status(400).json({ message: 'Tùy chọn thông báo không hợp lệ.' });
    }
    const updates = Object.fromEntries(Object.entries(input).map(([key, value]) => [`notificationPreferences.${key}`, value]));
    const user = await User.findByIdAndUpdate(req.user!.userId, { $set: updates }, { new: true }).select('notificationPreferences').lean();
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    const preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(user as any).notificationPreferences };
    logger.info('NOTIFICATION', `Updated category preferences for user ${req.user!.userId}`);
    res.json({ success: true, preferences });
  } catch (err: any) {
    logger.error('NOTIFICATION', `Error saving preferences for ${req.user!.userId}: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

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

// PUT /api/notifications/read-all/:userId - MUST come before :id/read
router.put('/read-all/:userId', async (req: Request, res: Response) => {
  try {
    const result = await Notification.updateMany({ userId: req.params.userId, read: false }, { read: true });
    logger.info('NOTIFICATION', `Marked all as read for user ${req.params.userId} (${result.modifiedCount} notifications)`);
    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (err: any) {
    logger.error('NOTIFICATION', `Error marking all read: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, type, message, link } = req.body;
    const notif = new Notification({ userId, type, message, link, read: false });
    await notif.save();
    publishNotification(String(userId), notif);
    logger.info('NOTIFICATION', `Created notification for user ${userId}: ${message.substring(0, 50)}`);
    res.json({ ...notif.toObject(), id: notif._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id, 
      { read: true },
      { new: true }
    );
    if (!notif) {
      logger.warn('NOTIFICATION', `Notification ${req.params.id} not found for mark-read`);
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo' });
    }
    logger.info('NOTIFICATION', `Marked notification ${req.params.id} as read for user ${notif.userId}`);
    res.json({ success: true, notification: { ...notif.toObject(), id: notif._id } });
  } catch (err: any) {
    logger.error('NOTIFICATION', `Error marking read: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
