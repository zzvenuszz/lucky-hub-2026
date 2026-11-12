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

async function decryptEmailProviderKey(provider: any, requestId: string): Promise<string> {
  if (!provider) {
    console.warn(`[Admin][${requestId}] No provider selected for decryption.`);
    return '';
  }

  const raw = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : '';
  const encryptedParts = raw.split(':');
  const encryptedFormat = encryptedParts.length === 3;
  console.log(`[Admin][${requestId}] Provider credential inspected:`, {
    providerId: provider._id?.toString?.() || 'unknown',
    provider: provider.provider,
    label: provider.label || '',
    active: !!provider.isActive,
    credentialPresent: !!raw,
    credentialMasked: raw.includes('••••'),
    encryptedFormat,
    credentialLength: raw.length,
    encryptionKeyConfigured: !!process.env.AI_ENCRYPTION_KEY,
  });

  if (!raw || raw.includes('••••')) return '';
  if (!encryptedFormat) {
    console.warn(`[Admin][${requestId}] Provider credential is stored as plaintext; using legacy compatibility path.`);
    return raw;
  }

  const { decrypt } = await getEncryption();
  try {
    const decrypted = decrypt(raw);
    console.log(`[Admin][${requestId}] Provider credential decrypted successfully.`, {
      provider: provider.provider,
      decryptedLength: decrypted.length,
    });
    return decrypted;
  } catch (error: any) {
    console.error(`[Admin][${requestId}] Provider credential decryption failed:`, {
      providerId: provider._id?.toString?.() || 'unknown',
      provider: provider.provider,
      encryptedLength: raw.length,
      encryptionKeyConfigured: !!process.env.AI_ENCRYPTION_KEY,
      errorName: error?.name || 'Error',
      errorMessage: error?.message || 'Unknown decryption error',
    });
    throw new Error('Không thể giải mã API key đã lưu. Hãy kiểm tra AI_ENCRYPTION_KEY của máy chủ; nếu khóa đã thay đổi, cần nhập và lưu lại API key của dịch vụ email.');
  }
}

async function logEmailEncryptionConfiguration(settings: any, requestId: string): Promise<void> {
  const storedKey = typeof settings?.ai?.encryptionKey === 'string' ? settings.ai.encryptionKey : '';
  const { decrypt } = await getEncryption();
  if (!storedKey) {
    console.warn(`[Admin][${requestId}] Stored encryption-key check unavailable: system setting has no AI encryption key.`);
    return;
  }

  try {
    const storedPlaintextKey = storedKey.split(':').length === 3 ? decrypt(storedKey) : storedKey;
    const matchesRuntimeKey = storedPlaintextKey === (process.env.AI_ENCRYPTION_KEY || '');
    console.log(`[Admin][${requestId}] Encryption-key configuration check:`, {
      storedKeyPresent: true,
      storedKeyEncrypted: storedKey.split(':').length === 3,
      runtimeKeyConfigured: !!process.env.AI_ENCRYPTION_KEY,
      matchesRuntimeKey,
    });
    if (!matchesRuntimeKey) {
      console.error(`[Admin][${requestId}] Runtime AI_ENCRYPTION_KEY does not match the key saved in system settings.`);
    }
  } catch (error: any) {
    console.error(`[Admin][${requestId}] Could not validate runtime encryption key against saved system settings:`, {
      errorName: error?.name || 'Error',
      errorMessage: error?.message || 'Unknown encryption configuration error',
    });
  }
}

async function exposeEmailProviderKeysForAdmin(providers: any[], requestId: string): Promise<any[]> {
  const { decrypt } = await getEncryption();
  return (providers || []).map((provider: any) => {
    const storedKey = typeof provider.apiKey === 'string' ? provider.apiKey : '';
    if (!storedKey) return { ...provider, apiKey: '', apiKeyConfigured: false, apiKeyLoadError: false };

    try {
      const apiKey = storedKey.split(':').length === 3 ? decrypt(storedKey) : storedKey;
      return { ...provider, apiKey, apiKeyConfigured: !!apiKey, apiKeyLoadError: false };
    } catch (error: any) {
      console.error(`[Admin][SystemSettings] Could not load email API key into admin settings form:`, {
        requestId,
        providerId: provider._id?.toString?.() || 'unknown',
        provider: provider.provider,
        errorName: error?.name || 'Error',
        errorMessage: error?.message || 'Unknown decryption error',
      });
      return { ...provider, apiKey: '', apiKeyConfigured: true, apiKeyLoadError: true };
    }
  });
}

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
    const requestId = `SystemSettings:${Date.now()}`;
    let settings = await SystemSettings.findOne({}).lean();

    if (!settings) {
      return res.json({
        email: { providers: [], senderEmail: '', senderName: '', appBaseUrl: '' },
        storage: { providers: [] },
        ai: { encryptionKey: '', geminiProxyUrl: '' },
      });
    }

    const adminSettings = {
      email: {
        ...settings.email,
        providers: await exposeEmailProviderKeysForAdmin(settings.email.providers, requestId),
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

    console.log(`[Admin][${requestId}] System settings loaded for admin UI:`, {
      emailProviderCount: adminSettings.email.providers.length,
      emailKeysLoaded: adminSettings.email.providers.filter((provider: any) => provider.apiKeyConfigured && !provider.apiKeyLoadError).length,
      emailKeysFailedToLoad: adminSettings.email.providers.filter((provider: any) => provider.apiKeyLoadError).length,
    });
    res.json(adminSettings);
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

    const adminSettings = {
      email: {
        ...settings.email,
        providers: await exposeEmailProviderKeysForAdmin(settings.email.providers, `SystemSettingsSave:${Date.now()}`),
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

    res.json({ success: true, settings: adminSettings, message: 'Đã lưu cài đặt!' });
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
  const requestId = `TestEmail:${Date.now()}`;
  const requestStartedAt = Date.now();
  res.on('finish', () => console.log(`[Admin][${requestId}] HTTP response completed:`, {
    statusCode: res.statusCode,
    durationMs: Date.now() - requestStartedAt,
  }));
  try {
    const { to, subject, html, providerId } = req.body;
    console.log(`[Admin][${requestId}] Step 1: Request received:`, {
      recipientProvided: !!to,
      recipientDomain: typeof to === 'string' && to.includes('@') ? to.split('@').pop() : 'invalid',
      subjectLength: typeof subject === 'string' ? subject.length : 0,
      htmlProvided: !!html,
      providerId: providerId || 'auto',
    });

    if (!to) {
      return res.status(400).json({ requestId, success: false, message: 'Email người nhận là bắt buộc' });
    }

    console.log(`[Admin][${requestId}] Step 2: Loading system email settings.`);
    const settings = await SystemSettings.findOne({});
    console.log(`[Admin][${requestId}] Email settings loaded:`, {
      settingsFound: !!settings,
      providerCount: settings?.email?.providers?.length || 0,
      activeProviderCount: settings?.email?.providers?.filter((p: any) => p.isActive).length || 0,
    });
    await logEmailEncryptionConfiguration(settings, requestId);
    let provider;

    if (providerId && settings?.email?.providers) {
      provider = settings.email.providers.find((p: any) => p._id.toString() === providerId);
      if (!provider) console.warn(`[Admin][${requestId}] Requested email provider was not found; falling back to first active provider.`);
    }

    if (!provider && settings?.email?.providers?.length > 0) {
      provider = settings.email.providers.find((p: any) => p.isActive);
    }

    console.log(`[Admin][${requestId}] Step 3: Provider selected:`, {
      providerId: provider?._id?.toString?.() || 'none',
      provider: provider?.provider || 'environment fallback',
      active: !!provider?.isActive,
    });
    const decryptedKey = await decryptEmailProviderKey(provider, requestId);

    console.log(`[Admin][${requestId}] Step 4: Starting provider send diagnostic.`);
    const diag = await emailService.sendEmailWithDiagnostic({
      to,
      subject: subject || 'Test Email - Lucky Hub',
      html: html || '<p>Đây là email test từ Lucky Hub Admin Panel</p>',
      preferredProvider: provider?.provider,
      apiKeyOverride: decryptedKey || undefined,
    });

    if (!diag.success) {
      console.error(`[Admin][${requestId}] Step 5: Provider send failed:`, {
        provider: provider?.provider || 'auto',
        error: diag.error,
        steps: diag.steps,
        details: diag.details,
      });
      return res.status(400).json({
        requestId,
        success: false,
        message: `Gửi email thất bại (${diag.error})`,
        steps: diag.steps,
        details: diag.details,
      });
    }

    console.log(`[Admin][${requestId}] Step 5: Test email sent successfully:`, {
      providerUsed: diag.providerUsed,
      durationMs: diag.details?.durationMs,
    });
    res.json({
      requestId,
      success: true,
      message: `Đã gửi email test thành công qua ${diag.providerUsed || provider?.provider || 'provider'}!`,
      providerUsed: diag.providerUsed,
      steps: diag.steps,
      details: diag.details,
    });
  } catch (err: any) {
    console.error(`[Admin][${requestId}] Test email flow failed:`, {
      errorName: err?.name || 'Error',
      errorMessage: err?.message || 'Unknown test email error',
      stack: err?.stack,
    });
    const decryptionFailure = typeof err?.message === 'string' && err.message.includes('Không thể giải mã API key đã lưu');
    res.status(decryptionFailure ? 400 : 500).json({ requestId, success: false, message: err.message || 'Gửi email thất bại' });
  }
});

// POST /api/admin/test-email/custom - Send custom test email
router.post('/test-email/custom', requirePermission(RESOURCES.AI.MANAGE), async (req: Request, res: Response) => {
  const requestId = `TestEmailCustom:${Date.now()}`;
  const requestStartedAt = Date.now();
  res.on('finish', () => console.log(`[Admin][${requestId}] HTTP response completed:`, {
    statusCode: res.statusCode,
    durationMs: Date.now() - requestStartedAt,
  }));
  try {
    const { to, subject, html, providerId } = req.body;
    console.log(`[Admin][${requestId}] Step 1: Request received:`, {
      recipientProvided: !!to,
      recipientDomain: typeof to === 'string' && to.includes('@') ? to.split('@').pop() : 'invalid',
      subjectLength: typeof subject === 'string' ? subject.length : 0,
      htmlProvided: !!html,
      providerId: providerId || 'auto',
    });

    if (!to) {
      return res.status(400).json({ requestId, success: false, message: 'Email người nhận là bắt buộc' });
    }

    console.log(`[Admin][${requestId}] Step 2: Loading system email settings.`);
    const settings = await SystemSettings.findOne({});
    console.log(`[Admin][${requestId}] Email settings loaded:`, {
      settingsFound: !!settings,
      providerCount: settings?.email?.providers?.length || 0,
      activeProviderCount: settings?.email?.providers?.filter((p: any) => p.isActive).length || 0,
    });
    await logEmailEncryptionConfiguration(settings, requestId);
    let provider;

    if (providerId && settings?.email?.providers) {
      provider = settings.email.providers.find((p: any) => p._id.toString() === providerId);
      if (!provider) console.warn(`[Admin][${requestId}] Requested email provider was not found; falling back to first active provider.`);
    }

    if (!provider && settings?.email?.providers?.length > 0) {
      provider = settings.email.providers.find((p: any) => p.isActive);
    }

    if (!provider) {
      return res.status(400).json({ requestId, success: false, message: 'Không có provider email nào active' });
    }

    console.log(`[Admin][${requestId}] Step 3: Provider selected:`, {
      providerId: provider?._id?.toString?.() || 'none',
      provider: provider?.provider || 'none',
      active: !!provider?.isActive,
    });
    const decryptedKey = await decryptEmailProviderKey(provider, requestId);

    console.log(`[Admin][${requestId}] Step 4: Starting provider send diagnostic.`);
    const diag = await emailService.sendEmailWithDiagnostic({
      to,
      subject: subject || 'Test Email Tùy Chỉnh - Lucky Hub',
      html: html || '<p>Đây là email test tùy chỉnh từ Lucky Hub Admin Panel</p>',
      preferredProvider: provider.provider,
      apiKeyOverride: decryptedKey || undefined,
    });

    if (!diag.success) {
      console.error(`[Admin][${requestId}] Step 5: Provider send failed:`, {
        provider: provider?.provider || 'unknown',
        error: diag.error,
        steps: diag.steps,
        details: diag.details,
      });
      return res.status(400).json({
        requestId,
        success: false,
        message: `Gửi email thất bại (${diag.error})`,
        steps: diag.steps,
        details: diag.details,
      });
    }

    console.log(`[Admin][${requestId}] Step 5: Custom test email sent successfully:`, {
      providerUsed: diag.providerUsed,
      durationMs: diag.details?.durationMs,
    });
    res.json({
      requestId,
      success: true,
      message: `Đã gửi email tùy chỉnh thành công qua ${diag.providerUsed || provider.provider}!`,
      providerUsed: diag.providerUsed,
      steps: diag.steps,
      details: diag.details,
    });
  } catch (err: any) {
    console.error(`[Admin][${requestId}] Custom test email flow failed:`, {
      errorName: err?.name || 'Error',
      errorMessage: err?.message || 'Unknown test email error',
      stack: err?.stack,
    });
    const decryptionFailure = typeof err?.message === 'string' && err.message.includes('Không thể giải mã API key đã lưu');
    res.status(decryptionFailure ? 400 : 500).json({ requestId, success: false, message: err.message || 'Gửi email thất bại' });
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
