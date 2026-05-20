import mongoose from 'mongoose';

const ActiveSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, unique: true },
  device: { type: String, default: 'unknown' },
  ip: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastPing: { type: Date, default: null },
}, { timestamps: true });

export const ActiveSession = mongoose.model('ActiveSession', ActiveSessionSchema);