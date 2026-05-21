import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['reaction', 'comment', 'reply', 'tag', 'message', 'metric_help', 'badge', 'system', 'goal_completed', 'goal_reminder'], default: 'system' },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  link: String,
  referenceId: String,
  actorId: String,
  actorName: String,
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

export const Notification = mongoose.model('Notification', NotificationSchema);
