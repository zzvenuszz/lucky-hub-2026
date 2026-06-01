import mongoose from 'mongoose';

/**
 * Model lưu cấu hình AI provider chính của hệ thống
 * key: 'active_provider' -> value: 'gemini' | 'cline'
 */
const AIConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  label: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const AIConfig = mongoose.model('AIConfig', AIConfigSchema);

/**
 * Lấy giá trị cấu hình theo key
 */
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const doc = await AIConfig.findOne({ key });
    return doc ? doc.value : null;
  } catch (err) {
    console.error(`[AIConfig] Failed to get config "${key}":`, err);
    return null;
  }
}

/**
 * Đặt giá trị cấu hình
 */
export async function setConfigValue(key: string, value: string, label?: string): Promise<void> {
  try {
    await AIConfig.findOneAndUpdate(
      { key },
      { key, value, label: label || '', updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`[AIConfig] Set "${key}" = "${value}"`);
  } catch (err) {
    console.error(`[AIConfig] Failed to set config "${key}":`, err);
  }
}

/**
 * Hằng số key cấu hình
 */
export const CONFIG_KEYS = {
  ACTIVE_PROVIDER: 'active_provider',
} as const;

/**
 * Giá trị provider
 */
export const AI_PROVIDERS = {
  GEMINI: 'gemini',
  CLINE: 'cline',
} as const;

export type AIProvider = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];