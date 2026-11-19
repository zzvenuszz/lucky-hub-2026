import mongoose from 'mongoose';

const RuleSchema = new mongoose.Schema({
  content: String,
  category: {
    type: String,
    enum: ['general', 'nutrition', 'meal_plan', 'exercise', 'health_advice', 'disease'],
    default: 'general',
  },
}, { timestamps: true });

export const Rule = mongoose.model('Rule', RuleSchema);
