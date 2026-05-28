import { Router, Request, Response } from 'express';
import { GeminiKey } from '../models/GeminiKey.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';
import { GoogleGenAI } from "@google/genai";

const router = Router();
router.use(authMiddleware);
router.use(requirePermission(RESOURCES.ADMIN.PANEL));

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req: Request, res: Response) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
  res.json(logs);
});

// GET /api/admin/env-keys
router.get('/env-keys', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const keys = [
    { label: 'API_KEY (Primary)', key: process.env.API_KEY },
    { label: 'API_KEY_2 (Backup)', key: process.env.API_KEY_2 },
    { label: 'API_KEY_3 (Backup)', key: process.env.API_KEY_3 }
  ].filter(k => !!k.key).map(k => ({
    label: k.label,
    key: k.key,
    display: `${k.key!.substring(0, 6)}••••${k.key!.substring(k.key!.length - 4)}`
  }));
  res.json(keys);
});

// GET /api/admin/gemini-keys
router.get('/gemini-keys', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const keys = await GeminiKey.find().sort({ createdAt: -1 });
  res.json(keys.map(k => ({ ...k.toObject(), id: k._id })));
});

// POST /api/admin/gemini-keys
router.post('/gemini-keys', requirePermission(RESOURCES.AI.MANAGE), validateBody(
  { field: 'key', type: 'string', required: true },
  { field: 'label', type: 'string', required: false, max: 100 }
), async (req: Request, res: Response) => {
    try {
      const { key, label } = req.body;

      // Check trùng lặp với ENV keys
      const ENV_API_KEYS = [
        process.env.API_KEY,
        process.env.API_KEY_2,
        process.env.API_KEY_3,
        process.env.GEMINI_API_KEY
      ].filter(k => !!k);
      
      if (ENV_API_KEYS.includes(key)) {
        return res.status(400).json({ message: 'KEY ĐÃ TỒN TẠI TRONG DANH SÁCH ENV' });
      }

      const newKey = new GeminiKey({ key, label });
      await newKey.save();
      res.json({ ...newKey.toObject(), id: newKey._id });
    } catch (err: any) {
      res.status(400).json({ message: 'KEY ĐÃ TỒN TẠI HOẶC KHÔNG HỢP LỆ' });
    }
});

// DELETE /api/admin/gemini-keys/:id
router.delete('/gemini-keys/:id', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    await GeminiKey.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/gemini-keys/:id/toggle
router.put('/gemini-keys/:id/toggle', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    await GeminiKey.findByIdAndUpdate(req.params.id, { isActive });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/gemini-keys/check
router.post('/gemini-keys/check', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'ping',
    });
    if (response && response.text) res.json({ status: 'ok' });
    else throw new Error("No response");
  } catch (err: any) {
    res.status(400).json({ message: "Key không hoạt động: " + err.message });
  }
});

export default router;