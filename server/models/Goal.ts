import mongoose from 'mongoose';

const GoalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['weight', 'bodyFat', 'muscleMass', 'waterPercent', 'boneMinerals', 'visceralFat', 'energy', 'bioAge', 'balanceIndex'],
    required: true 
  },
  targetValue: { type: Number, required: true },
  startValue: { type: Number, default: 0 },
  startDate: { type: String, required: true },
  targetDate: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  progress: { type: Number, default: 0 },
  lastReminderSent: { type: Date, default: null },
}, { timestamps: true });

export const Goal = mongoose.model('Goal', GoalSchema);