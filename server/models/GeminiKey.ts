import mongoose from 'mongoose';

const GeminiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, default: 'Unnamed Key' },
  isActive: { type: Boolean, default: true },
  failCount: { type: Number, default: 0 },
  cooldownUntil: { type: Date, default: null },
  lastUsed: { type: Date, default: null },
}, { timestamps: true });

export const GeminiKey = mongoose.model('GeminiKey', GeminiKeySchema);