import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { completeFirstRunSetup, getAdminRequirementForDatabase, getFirstRunSetupStatus, hasAdministratorAccount, initializeSetupAccessToken, isFirstRunSetupRequired, testConfiguredMongoConnection, testMongoConnection, SetupInput } from '../services/firstRunSetup.ts';
import { generateEncryptionKey } from '../utils/encryption.ts';
import { discoverModelsForAllProviders } from '../services/ai/modelDiscovery.ts';

const router = Router();

const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu setup. Vui lòng thử lại sau.' },
});

async function requireSetupToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (mongoose.connection.readyState === 1 && await hasAdministratorAccount()) {
      next();
      return;
    }
  } catch (error) {
    console.error('[FirstRunSetup] Could not verify existing administrator:', error instanceof Error ? error.message : error);
    res.status(500).json({ message: 'Không thể xác minh tài khoản quản trị hiện có.' });
    return;
  }

  const requiredToken = initializeSetupAccessToken();
  const suppliedToken = req.header('x-setup-token') || '';
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(requiredToken);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    res.status(403).json({ message: 'Mã truy cập setup không hợp lệ. Hãy lấy mã hiện tại từ log máy chủ.' });
    return;
  }
  next();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Lỗi setup không xác định.';
  return message.replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, 'mongodb://[đã ẩn thông tin xác thực]');
}

router.get('/status', async (_req, res) => {
  try {
    const setupStatus = await getFirstRunSetupStatus();
    res.json({ setupRequired: await isFirstRunSetupRequired(), ...setupStatus });
  } catch (error) {
    console.error('[FirstRunSetup] Could not read setup state:', safeErrorMessage(error));
    res.status(500).json({ message: 'Không thể đọc trạng thái setup. Kiểm tra quyền truy cập thư mục dữ liệu.' });
  }
});

router.post('/generate-key', setupLimiter, requireSetupToken, async (_req, res) => {
  try {
    if (!(await isFirstRunSetupRequired())) return res.status(409).json({ message: 'Ứng dụng đã được setup.' });
    res.json({ encryptionKey: generateEncryptionKey() });
  } catch (error) {
    console.error('[FirstRunSetup] Encryption key generation failed:', safeErrorMessage(error));
    res.status(500).json({ message: 'Không thể tạo khóa mã hóa.' });
  }
});

router.post('/test-database', setupLimiter, requireSetupToken, async (req, res) => {
  try {
    if (!(await isFirstRunSetupRequired())) return res.status(409).json({ message: 'Ứng dụng đã được setup.' });
    const databaseUri = mongoose.connection.readyState === 1
      ? process.env.MONGODB_URI?.trim() || req.body?.databaseUri
      : req.body?.databaseUri || process.env.MONGODB_URI?.trim();
    if (process.env.MONGODB_URI?.trim() && mongoose.connection.readyState === 1) {
      await testConfiguredMongoConnection();
    } else {
      await testMongoConnection(databaseUri);
    }
    const adminRequired = await getAdminRequirementForDatabase(databaseUri);
    console.log('[FirstRunSetup] MongoDB connection test succeeded.');
    res.json({ success: true, adminRequired, message: 'Kết nối MongoDB thành công.' });
  } catch (error) {
    console.error('[FirstRunSetup] MongoDB connection test failed:', safeErrorMessage(error));
    res.status(400).json({ message: `Không thể kết nối MongoDB: ${safeErrorMessage(error)}` });
  }
});

router.post('/complete', setupLimiter, requireSetupToken, async (req, res) => {
  try {
    const adminCreated = await completeFirstRunSetup(req.body as SetupInput);
    discoverModelsForAllProviders().catch((error: any) => {
      console.error('[FirstRunSetup] AI model discovery failed after setup:', error?.message || error);
    });
    console.log('[FirstRunSetup] Initial setup completed.');
    res.json({
      success: true,
      message: adminCreated
        ? 'Setup hoàn tất. Tài khoản quản trị mới đã sẵn sàng.'
        : 'Setup hoàn tất. Database đã có người dùng nên không tạo thêm tài khoản admin.',
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    console.error('[FirstRunSetup] Setup completion failed:', message);
    const status = /đã được setup|đang được thực hiện/i.test(message) || /đã có người dùng/i.test(message) ? 409 : 400;
    res.status(status).json({ message });
  }
});

export default router;
