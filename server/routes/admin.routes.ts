import { Router, Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog.ts';
import { SystemSettings } from '../models/SystemSettings.ts';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { validateBody } from '../../services/validationService.ts';
import { emailService } from '../../services/emailService.ts';
import { uploadBrandLogo, uploadImageToStorageProvider } from '../services/storage/imageStorageService.ts';
// Using dynamic import for encryption to avoid tsx resolution issues
const getEncryption = async () => {
  const { encrypt, decrypt } = await import('../utils/encryption.ts');
  return { encrypt, decrypt };
};

const router = Router();
router.use(authMiddleware);
router.use(requirePermission(RESOURCES.ADMIN.PANEL));

const DEFAULT_BRANDING = {
  logoUrl: '',
  slogan: 'SỐNG KHOẺ MỖI NGÀY',
  copyrightLine1: '© <year> Lucky Hub. Bảo mật và đáng tin cậy.',
  copyrightLine2: '',
};
const STORAGE_SECRET_FIELDS = ['apiKey', 'apiSecret', 'accessKey', 'secretKey'];

function maskStorageProvider(provider: any) {
  const config = { ...(provider.config || {}) };
  for (const field of STORAGE_SECRET_FIELDS) {
    if (config[field]) config[field] = '••••••••';
  }
  return { ...provider, config };
}

router.get('/system-branding', async (_req: Request, res: Response) => {
  try {
    const settings = await SystemSettings.findOne({}).select('branding').lean();
    const branding = settings?.branding;
    res.json({
      logoUrl: branding?.logoUrl ?? DEFAULT_BRANDING.logoUrl,
      slogan: branding?.slogan ?? DEFAULT_BRANDING.slogan,
      copyrightLine1: branding?.copyrightLine1 ?? DEFAULT_BRANDING.copyrightLine1,
      copyrightLine2: branding?.copyrightLine2 ?? DEFAULT_BRANDING.copyrightLine2,
    });
  } catch (error: any) {
    console.error('[Admin] Get system branding failed:', error);
    res.status(500).json({ message: error.message || 'Không thể tải thông tin thương hiệu.' });
  }
});

router.put('/system-branding', async (req: Request, res: Response) => {
  try {
    const { slogan, copyrightLine1, copyrightLine2, logoUrl } = req.body;
    if ([slogan, copyrightLine1, copyrightLine2].some(value => typeof value !== 'string')) {
      return res.status(400).json({ message: 'Thông tin thương hiệu không hợp lệ.' });
    }
    if (slogan.length > 120 || copyrightLine1.length > 300 || copyrightLine2.length > 300) {
      return res.status(400).json({ message: 'Slogan tối đa 120 ký tự; mỗi dòng copyright tối đa 300 ký tự.' });
    }
    if (typeof logoUrl !== 'string' || logoUrl.length > 2048) {
      return res.status(400).json({ message: 'Logo không hợp lệ.' });
    }
    if (logoUrl) {
      try {
        if (new URL(logoUrl).protocol !== 'https:') return res.status(400).json({ message: 'Logo phải dùng URL HTTPS.' });
      } catch {
        return res.status(400).json({ message: 'Logo phải dùng URL HTTPS hợp lệ.' });
      }
    }

    const branding = {
      slogan: slogan.trim(),
      copyrightLine1: copyrightLine1.trim(),
      copyrightLine2: copyrightLine2.trim(),
      logoUrl,
    };
    await SystemSettings.findOneAndUpdate(
      {},
      { $set: { branding, updatedBy: (req as any).user?.fullName || 'admin', updatedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    console.log('[SystemBranding] Updated brand configuration:', { user: (req as any).user?.fullName || 'admin' });
    res.json({ success: true, branding, message: 'Đã lưu thông tin thương hiệu.' });
  } catch (error: any) {
    console.error('[Admin] Save system branding failed:', error);
    res.status(500).json({ message: error.message || 'Không thể lưu thông tin thương hiệu.' });
  }
});

router.post('/system-branding/logo', async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.imageData !== 'string') {
      return res.status(400).json({ message: 'Dữ liệu logo không hợp lệ.' });
    }
    const logoUrl = await uploadBrandLogo(req.body.imageData);
    console.log('[SystemBranding] Logo uploaded:', { provider: 'configured-storage' });
    res.json({ success: true, logoUrl });
  } catch (error: any) {
    console.error('[Admin] Upload system logo failed:', error);
    const statusCode = /ảnh|logo|thiếu|provider|bucket|region|key|secret|cloud name/i.test(error.message) ? 400 : 500;
    res.status(statusCode).json({ message: error.message || 'Không thể tải logo lên.' });
  }
});

// ============================================================================
// SYSTEM SETTINGS CRUD
// ============================================================================

// GET /api/admin/system-settings - Get all settings
router.get('/system-settings', async (req: Request, res: Response) => {
  try {
    let settings = await SystemSettings.findOne({}).lean();

    if (!settings) {
      return res.json({
        email: { providers: [], senderEmail: '', senderName: '', appBaseUrl: '' },
        storage: { providers: [] },
        ai: { encryptionKey: '', geminiProxyUrl: '' },
      });
    }

    const maskedSettings = {
      email: {
        ...settings.email,
        providers: settings.email.providers.map((p: any) => ({
          ...p,
          apiKey: p.apiKey ? `${p.apiKey.substring(0, 6)}••••${p.apiKey.substring(p.apiKey.length - 4)}` : '',
        })),
      },
      storage: {
        ...settings.storage,
        providers: settings.storage.providers.map(maskStorageProvider),
      },
      ai: {
        ...settings.ai,
        encryptionKey: settings.ai.encryptionKey ? '••••••••••••••••••••••••••••••••••••' : '',
      },
    };

    res.json(maskedSettings);
  } catch (err: any) {
    console.error('[Admin] Get system settings failed:', err);
    res.status(500).json({ message: err.message || 'Lấy cài đặt thất bại' });
  }
});

// POST /api/admin/system-settings - Create or update settings
router.post('/system-settings', async (req: Request, res: Response) => {
  try {
    const { email, storage, ai } = req.body;
    const user = (req as any).user?.fullName || 'admin';

    let settings: any = await SystemSettings.findOne({});

    const updateData: any = { updatedBy: user, updatedAt: new Date() };

    if (email) {
      const { encrypt } = await getEncryption();
      const providers = (email.providers || []).map((p: any) => {
        const oldProvider = settings?.email?.providers?.find(
          (existing: any) =>
            (p._id && existing._id?.toString() === p._id.toString()) ||
            (existing.provider === p.provider && existing.label === p.label)
        );
        const submittedKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : '';
        let finalKey = '';
        if (submittedKey && !submittedKey.includes('••••')) {
          finalKey = submittedKey.split(':').length === 3 ? submittedKey : encrypt(submittedKey);
        } else if (oldProvider?.apiKey && !String(oldProvider.apiKey).includes('••••')) {
          const storedKey = String(oldProvider.apiKey);
          finalKey = storedKey.split(':').length === 3 ? storedKey : encrypt(storedKey);
        }
        return {
          ...p,
          apiKey: finalKey,
        };
      });
      updateData.email = { ...email, providers };
    }

    if (storage) {
      const { encrypt } = await getEncryption();
      const providers = (storage.providers || []).map((p: any) => {
        const oldProvider = settings?.storage?.providers?.find((existing: any) => existing._id.toString() === p._id);
        const oldConfig = oldProvider?.config?.toObject?.() || oldProvider?.config || {};
        const config = { ...oldConfig, ...(p.config || {}) };
        for (const field of STORAGE_SECRET_FIELDS) {
          const submittedValue = p.config?.[field];
          const storedValue = oldConfig[field];
          if (typeof submittedValue === 'string' && submittedValue && !submittedValue.includes('••••')) {
            config[field] = encrypt(submittedValue);
          } else if (storedValue) {
            const storedSecret = String(storedValue);
            config[field] = storedSecret.split(':').length === 3 ? storedSecret : encrypt(storedSecret);
          } else {
            delete config[field];
          }
        }
        return { ...p, config };
      });
      updateData.storage = { ...storage, providers };
    }

    if (ai) {
      const { encrypt } = await getEncryption();
      updateData.ai = { ...ai };
      if (ai.encryptionKey && !ai.encryptionKey.includes('••••')) {
        updateData.ai.encryptionKey = encrypt(ai.encryptionKey);
      } else if (settings?.ai?.encryptionKey && !String(settings.ai.encryptionKey).includes('••••')) {
        updateData.ai.encryptionKey = settings.ai.encryptionKey;
      }
    }

    if (settings) {
      settings = await SystemSettings.findOneAndUpdate({}, updateData, { new: true }).lean();
    } else {
      settings = await SystemSettings.create({ ...updateData, createdBy: user });
    }

    const masked = {
      email: {
        ...settings.email,
        providers: settings.email.providers.map((p: any) => ({
          ...p,
          apiKey: p.apiKey ? `${p.apiKey.substring(0, 6)}••••${p.apiKey.substring(p.apiKey.length - 4)}` : '',
        })),
      },
      storage: {
        ...settings.storage,
        providers: settings.storage.providers.map(maskStorageProvider),
      },
      ai: {
        ...settings.ai,
        encryptionKey: settings.ai.encryptionKey ? '••••••••••••••••••••••••••••••••••••' : '',
      },
    };

    res.json({ success: true, settings: masked, message: 'Đã lưu cài đặt!' });
  } catch (err: any) {
    console.error('[Admin] Save system settings failed:', err);
    res.status(500).json({ message: err.message || 'Lưu cài đặt thất bại' });
  }
});

// DELETE /api/admin/system-settings/:section/:providerId - Delete provider
router.delete('/system-settings/:section/:providerId', async (req: Request, res: Response) => {
  try {
    const { section, providerId } = req.params;
    const user = (req as any).user?.fullName || 'admin';

    if (!['email', 'storage'].includes(section)) {
      return res.status(400).json({ message: 'Section không hợp lệ' });
    }

    const settings = await SystemSettings.findOne({});
    if (!settings) {
      return res.status(404).json({ message: 'Chưa có cài đặt' });
    }

    settings[section].providers = settings[section].providers.filter((p: any) => p._id.toString() !== providerId);
    settings.updatedBy = user;
    settings.updatedAt = new Date();
    await settings.save();

    res.json({ success: true, message: 'Đã xóa provider!' });
  } catch (err: any) {
    console.error('[Admin] Delete provider failed:', err);
    res.status(500).json({ message: err.message || 'Xóa thất bại' });
  }
});

// ============================================================================
// TEST ENDPOINTS
// ============================================================================

// POST /api/admin/test-email - Send test email with custom content
router.post('/test-email', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { to, subject, html, providerId } = req.body;
    console.log('[Admin][TestEmail] Step 1: Received /api/admin/test-email request:', { to, subject, providerId });

    if (!to) {
      return res.status(400).json({ success: false, message: 'Email người nhận là bắt buộc' });
    }

    const settings = await SystemSettings.findOne({});
    let provider;

    if (providerId && settings?.email?.providers) {
      provider = settings.email.providers.find((p: any) => p._id.toString() === providerId);
    }

    if (!provider && settings?.email?.providers?.length > 0) {
      provider = settings.email.providers.find((p: any) => p.isActive);
    }

    let decryptedKey = '';
    if (provider?.apiKey) {
      const { decrypt } = await getEncryption();
      const raw = String(provider.apiKey).trim();
      if (raw && !raw.includes('••••')) {
        decryptedKey = raw.split(':').length === 3 ? decrypt(raw) : raw;
      }
    }

    const diag = await emailService.sendEmailWithDiagnostic({
      to,
      subject: subject || 'Test Email - Lucky Hub',
      html: html || '<p>Đây là email test từ Lucky Hub Admin Panel</p>',
      preferredProvider: provider?.provider,
      apiKeyOverride: decryptedKey || undefined,
    });

    if (!diag.success) {
      console.error('[Admin][TestEmail] ❌ Step 2: Failed to send test email:', diag);
      return res.status(400).json({
        success: false,
        message: `Gửi email thất bại (${diag.error})`,
        steps: diag.steps,
        details: diag.details,
      });
    }

    console.log('[Admin][TestEmail] ✅ Step 2: Sent test email successfully via', diag.providerUsed);
    res.json({
      success: true,
      message: `Đã gửi email test thành công qua ${diag.providerUsed || provider?.provider || 'provider'}!`,
      providerUsed: diag.providerUsed,
      steps: diag.steps,
      details: diag.details,
    });
  } catch (err: any) {
    console.error('[Admin] Test email failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Gửi email thất bại' });
  }
});

// POST /api/admin/test-email/custom - Send custom test email
router.post('/test-email/custom', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { to, subject, html, providerId } = req.body;
    console.log('[Admin][TestEmailCustom] Step 1: Received /api/admin/test-email/custom request:', { to, subject, providerId });

    if (!to) {
      return res.status(400).json({ success: false, message: 'Email người nhận là bắt buộc' });
    }

    const settings = await SystemSettings.findOne({});
    let provider;

    if (providerId && settings?.email?.providers) {
      provider = settings.email.providers.find((p: any) => p._id.toString() === providerId);
    }

    if (!provider && settings?.email?.providers?.length > 0) {
      provider = settings.email.providers.find((p: any) => p.isActive);
    }

    if (!provider) {
      return res.status(400).json({ success: false, message: 'Không có provider email nào active' });
    }

    let decryptedKey = '';
    if (provider?.apiKey) {
      const { decrypt } = await getEncryption();
      const raw = String(provider.apiKey).trim();
      if (raw && !raw.includes('••••')) {
        decryptedKey = raw.split(':').length === 3 ? decrypt(raw) : raw;
      }
    }

    const diag = await emailService.sendEmailWithDiagnostic({
      to,
      subject: subject || 'Test Email Tùy Chỉnh - Lucky Hub',
      html: html || '<p>Đây là email test tùy chỉnh từ Lucky Hub Admin Panel</p>',
      preferredProvider: provider.provider,
      apiKeyOverride: decryptedKey || undefined,
    });

    if (!diag.success) {
      console.error('[Admin][TestEmailCustom] ❌ Step 2: Failed to send custom test email:', diag);
      return res.status(400).json({
        success: false,
        message: `Gửi email thất bại (${diag.error})`,
        steps: diag.steps,
        details: diag.details,
      });
    }

    console.log('[Admin][TestEmailCustom] ✅ Step 2: Sent custom test email successfully via', diag.providerUsed);
    res.json({
      success: true,
      message: `Đã gửi email tùy chỉnh thành công qua ${diag.providerUsed || provider.provider}!`,
      providerUsed: diag.providerUsed,
      steps: diag.steps,
      details: diag.details,
    });
  } catch (err: any) {
    console.error('[Admin] Custom test email failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Gửi email thất bại' });
  }
});

// POST /api/admin/test-storage - Test image storage with specific provider
router.post('/test-storage', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  try {
    const { providerId } = req.body;

    const settings = await SystemSettings.findOne({});
    if (!settings?.storage?.providers?.length) {
      return res.status(400).json({ message: 'Chưa cấu hình storage provider' });
    }

    let provider;
    if (providerId) {
      provider = settings.storage.providers.find((p: any) => p._id.toString() === providerId);
    } else {
      provider = settings.storage.providers
        .filter((p: any) => p.isActive)
        .sort((a: any, b: any) => a.priority - b.priority)[0];
    }

    if (!provider) {
      return res.status(400).json({ message: 'Không tìm thấy provider storage' });
    }

    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const url = await uploadImageToStorageProvider(testImageBase64, provider);
    res.json({ success: true, message: `Test upload thành công qua ${provider.provider}`, url });
  } catch (err: any) {
    console.error('[Admin] Test storage failed:', err);
    res.status(500).json({ success: false, message: err.message || 'Test storage thất bại' });
  }
});

// NOTE: the previous "legacy" block duplicated POST /test-email and POST /test-storage
// on the same paths. Express only ever ran the first handler registered above, so the
// duplicates were unreachable dead code and have been removed. Both endpoints still exist.

export default router;