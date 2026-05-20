import mongoose from 'mongoose';

const MetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number,
  bodyFat: Number,
  boneMinerals: Number,
  waterPercent: Number,
  muscleMass: Number,
  balanceIndex: { type: Number, default: 0 },
  energy: Number,
  bioAge: Number,
  visceralFat: Number,
}, { timestamps: true });

export const Metric = mongoose.model('Metric', MetricSchema);