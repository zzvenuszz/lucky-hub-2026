import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
}, { timestamps: true });

export const PasswordResetToken = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);