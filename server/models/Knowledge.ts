import mongoose from 'mongoose';

const KnowledgeSchema = new mongoose.Schema({
  keyword: String,
  content: String,
}, { timestamps: true });

export const Knowledge = mongoose.model('Knowledge', KnowledgeSchema);