import mongoose from 'mongoose';

const KnowledgeSchema = new mongoose.Schema({
  keyword: { type: String, required: true },
  content: { type: String, required: true },
  category: {
    type: String,
    enum: ['nutrition', 'meal_plan', 'exercise', 'health_advice', 'disease', 'general'],
    default: 'general'
  },
  tags: [{ type: String }],
  relatedKeywords: [{ type: String }],
  source: { type: String, default: '' },
}, { timestamps: true });

// Text index cho tìm kiếm full-text
KnowledgeSchema.index({ keyword: 'text', tags: 'text', content: 'text' });
// Index cho tìm kiếm theo category
KnowledgeSchema.index({ category: 1 });
// Index cho tags
KnowledgeSchema.index({ tags: 1 });

export const Knowledge = mongoose.model('Knowledge', KnowledgeSchema);