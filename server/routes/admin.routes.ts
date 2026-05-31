import { Router, Request, Response } from 'express';
import { GeminiKey } from '../models/GeminiKey.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';

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

/**
 * Kiểm tra key Gemini bằng ListModels API - KHÔNG tốn quota generateContent
 * Trả về model tốt nhất tìm được nếu key hợp lệ, hoặc throw error nếu key lỗi
 */
async function verifyGeminiKey(apiKey: string): Promise<{ valid: boolean; bestModel?: string; error?: string }> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await response.json();

    if (!response.ok || data.error) {
      return { valid: false, error: data.error?.message || `HTTP ${response.status}` };
    }

    if (data.models && data.models.length > 0) {
      // Lọc model Gemini hỗ trợ generateContent
      const availableModels = data.models
        .filter((m: any) =>
          m.name?.startsWith('models/gemini-') &&
          m.supportedMethods?.includes('generateContent')
        )
        .map((m: any) => m.name.replace('models/', ''));

      if (availableModels.length > 0) {
        // Sắp xếp ưu tiên: flash > pro, version mới > cũ
        availableModels.sort((a: string, b: string) => {
          const getPriority = (name: string) => {
            if (name.includes('flash')) return 2;
            if (name.includes('pro') || name.includes('exp')) return 1;
            return 0;
          };
          const pA = getPriority(a), pB = getPriority(b);
          if (pA !== pB) return pB - pA;
          return b.localeCompare(a);
        });

        console.log(`[GeminiCheck] Key valid, best model: ${availableModels[0]}`);
        return { valid: true, bestModel: availableModels[0] };
      }
    }

    return { valid: true, bestModel: 'gemini-2.0-flash' };
  } catch (err: any) {
    console.warn('[GeminiCheck] ListModels request failed:', err.message);
    return { valid: false, error: err.message };
  }
}

// POST /api/admin/gemini-keys/check
router.post('/gemini-keys/check', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    console.log(`[GeminiCheck] Testing key...`);
    
    // Kiểm tra key bằng ListModels API - giống curl test, KHÔNG tốn quota
    const result = await verifyGeminiKey(key);
    
    if (result.valid) {
      console.log(`[GeminiCheck] Key is valid (model: ${result.bestModel})`);
      res.json({ status: 'ok', modelUsed: result.bestModel });
    } else {
      throw new Error(result.error || 'Key không hoạt động');
    }
  } catch (err: any) {
    console.error(`[GeminiCheck] Key test failed:`, err.message);
    res.status(400).json({ message: "Key không hoạt động: " + err.message });
  }
});

export default router;
