import mongoose from 'mongoose';

// Email Service Settings
const EmailProviderSchema = new mongoose.Schema({
  provider: { type: String, enum: ['brevo', 'sendgrid'], required: true },
  apiKey: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  label: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const EmailSettingsSchema = new mongoose.Schema({
  providers: [EmailProviderSchema],
  senderEmail: { type: String, default: 'luckyhubvn@gmail.com' },
  senderName: { type: String, default: 'Lucky Hub' },
  appBaseUrl: { type: String, default: 'https://lucky-hub-2026.onrender.com' },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' },
});

// Storage Service Settings
const StorageProviderSchema = new mongoose.Schema({
  provider: { type: String, enum: ['imgbb', 'cloudinary', 's3'], required: true },
  config: mongoose.Schema.Types.Mixed, // Flexible config object
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 1 },
  label: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const StorageSettingsSchema = new mongoose.Schema({
  providers: [StorageProviderSchema],
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' },
});

// AI Settings
const AISettingsSchema = new mongoose.Schema({
  encryptionKey: { type: String, required: true },
  geminiProxyUrl: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: 'system' },
});

const BrandingSettingsSchema = new mongoose.Schema({
  logoUrl: { type: String, default: '' },
  slogan: { type: String, default: 'SỐNG KHOẺ MỖI NGÀY' },
  copyrightLine1: { type: String, default: '© <year> Lucky Hub. Bảo mật và đáng tin cậy.' },
  copyrightLine2: { type: String, default: '' },
});

// Main System Settings
const SystemSettingsSchema = new mongoose.Schema({
  singleton: { type: String, default: 'system', enum: ['system'], immutable: true },
  firstRunSetupComplete: { type: Boolean, default: false },
  email: EmailSettingsSchema,
  storage: StorageSettingsSchema,
  ai: AISettingsSchema,
  branding: { type: BrandingSettingsSchema, default: () => ({}) },
  updatedBy: { type: String, default: 'system' },
}, { timestamps: true });

// Ensure only one document exists
SystemSettingsSchema.index({ singleton: 1 }, { unique: true, name: 'unique_system_settings' });

export const SystemSettings = mongoose.model('SystemSettings', SystemSettingsSchema);