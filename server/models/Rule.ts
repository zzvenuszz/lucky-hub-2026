import mongoose from 'mongoose';

const RuleSchema = new mongoose.Schema({
  content: String,
}, { timestamps: true });

export const Rule = mongoose.model('Rule', RuleSchema);