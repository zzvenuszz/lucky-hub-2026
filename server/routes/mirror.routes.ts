import { Router, Request, Response } from 'express';
import { User } from '../models/User.ts';
import { Metric } from '../models/Metric.ts';

const router = Router();

// Magic Mirror - KHÔNG AUTH (chỉ mirror local gửi request)

// GET /MM/config
router.get('/config', async (req: Request, res: Response) => {
  try {
    const { configService } = await import('../../src/services/configService.ts');
    const config = await configService.getMirrorConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /MM/:username/info
router.get('/:username/info', async (req: Request, res: Response) => {
  const username = req.params.username.toLowerCase().trim();
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /MM/:username/metrics/:n
router.get('/:username/metrics/:n', async (req: Request, res: Response) => {
  const username = req.params.username.toLowerCase().trim();
  const n = parseInt(req.params.n) || 1;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const metrics = await Metric.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(n);

    res.json(metrics.map(m => ({ ...m.toObject(), id: m._id })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /MM/users/sync
router.get('/users/sync', async (req: Request, res: Response) => {
  try {
    const users = await User.find({}, 'username fullName avatar avatarHash updatedAt');
    res.json(users.map(u => ({
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      avatarHash: (u as any).avatarHash,
      updatedAt: (u as any).updatedAt
    })));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /MM/tts/greeting/:name
router.get('/tts/greeting/:name', async (req: Request, res: Response) => {
  const name = req.params.name;
  const customPrompt = req.query.prompt as string;
  try {
    const { ttsService } = await import('../../src/services/ttsService.ts');
    const { callAIWithRetry } = await import('../services/aiService.ts');
    const audioBuffer = await ttsService.generateGreeting(name, customPrompt, callAIWithRetry);

    if (audioBuffer) {
      res.set('Content-Type', 'audio/wav');
      res.send(audioBuffer);
    } else {
      res.status(204).end();
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;