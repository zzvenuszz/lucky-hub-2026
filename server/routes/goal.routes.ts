import { Router, Request, Response } from 'express';
import { Goal } from '../models/Goal.ts';
import { Metric } from '../models/Metric.ts';
import { Notification } from '../models/Notification.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';

const router = Router();
router.use(authMiddleware);

// GET /api/goals/:userId
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const goals = await Goal.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(goals.map(g => ({ ...g.toObject(), id: g._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals
router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, type, targetValue, startValue, startDate, targetDate } = req.body;
    const goal = new Goal({ userId, type, targetValue, startValue: startValue || 0, startDate, targetDate, progress: 0, status: 'active' });
    await goal.save();
    res.json({ ...goal.toObject(), id: goal._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/goals/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { targetValue, targetDate, status } = req.body;
    const updateData: any = {};
    if (targetValue !== undefined) updateData.targetValue = targetValue;
    if (targetDate !== undefined) updateData.targetDate = targetDate;
    if (status !== undefined) updateData.status = status;

    const goal = await Goal.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!goal) return res.status(404).json({ message: 'Goal not found' });
    res.json({ ...goal.toObject(), id: goal._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals/check-reminders/:userId - Kiểm tra và gửi reminder
router.post('/check-reminders/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const now = new Date();
    const goals = await Goal.find({ userId, status: 'active' });
    const reminders: any[] = [];

    for (const goal of goals) {
      const targetDate = new Date(goal.targetDate);
      const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Gửi reminder khi còn 3 ngày, 1 ngày
      if (diffDays === 3 || diffDays === 1) {
        reminders.push({
          goalId: goal._id,
          type: goal.type,
          daysLeft: diffDays,
          progress: goal.progress,
        });
      }

      // Kiểm tra nếu đã quá hạn và chưa hoàn thành
      if (diffDays < 0 && goal.progress < 100) {
        reminders.push({
          goalId: goal._id,
          type: goal.type,
          daysLeft: diffDays,
          overdue: true,
          progress: goal.progress,
        });
      }
    }

    res.json({ reminders });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals/:goalId/notify-completed - Thông báo hoàn thành goal
router.post('/:goalId/notify-completed', async (req: Request, res: Response) => {
  try {
    const { goalId } = req.params;
    const goal = await Goal.findById(goalId);
    if (!goal) return res.status(404).json({ message: 'Goal not found' });

    if (goal.status !== 'completed') return res.json({ message: 'Goal chưa hoàn thành' });

    await Notification.create({
      userId: goal.userId, type: 'goal_completed',
      message: `🎉 Chúc mừng! Bạn đã hoàn thành mục tiêu "${goal.type}"!`,
      link: '/goals',
      referenceId: goal._id.toString(),
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/goals/recalculate/:userId
router.post('/recalculate/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const goals = await Goal.find({ userId, status: 'active' });
    const latestMetric = await Metric.findOne({ userId }).sort({ date: -1 });
    if (!latestMetric) return res.json({ goals: goals.map(g => ({ ...g.toObject(), id: g._id })) });

    const updatedGoals = [];
    for (const goal of goals) {
      const currentValue = (latestMetric as any)[goal.type] || 0;
      const startValue = goal.startValue || 0;
      const targetValue = goal.targetValue;
      const range = Math.abs(targetValue - startValue);

      let progress = 0;
      if (range > 0) {
        const isDecrease = targetValue < startValue;
        const achieved = isDecrease ? (startValue - currentValue) : (currentValue - startValue);
        progress = Math.min(100, Math.max(0, Math.round((achieved / range) * 100)));
      }

      goal.progress = progress;
      if (progress >= 100) goal.status = 'completed';
      await goal.save();
      updatedGoals.push({ ...goal.toObject(), id: goal._id });
    }

    res.json({ goals: updatedGoals });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;