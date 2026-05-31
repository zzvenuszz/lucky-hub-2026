import mongoose from 'mongoose';

const GeminiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, default: 'Unnamed Key' },
  isActive: { type: Boolean, default: true },
  failCount: { type: Number, default: 0 },
  cooldownUntil: { type: Date, default: null },
  lastUsed: { type: Date, default: null },
  lastHealthCheck: { type: Date, default: null },
  workingModels: [{ type: String }],
  healthStatus: { type: String, enum: ['unknown', 'healthy', 'quota_exceeded', 'location_blocked', 'error'], default: 'unknown' },
}, { timestamps: true });

export const GeminiKey = mongoose.model('GeminiKey', GeminiKeySchema);