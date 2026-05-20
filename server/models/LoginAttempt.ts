import mongoose from 'mongoose';

const LoginAttemptSchema = new mongoose.Schema({
  identifier: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastAttempt: { type: Date, default: null },
}, { timestamps: true });

export const LoginAttempt = mongoose.model('LoginAttempt', LoginAttemptSchema);