import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['reaction', 'message', 'metric_help', 'badge', 'system'], default: 'system' },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  link: String,
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

export const Notification = mongoose.model('Notification', NotificationSchema);