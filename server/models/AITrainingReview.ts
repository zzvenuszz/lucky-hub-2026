import mongoose from 'mongoose';

const AITrainingReviewSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, index: true },
  query: { type: String, required: true, maxlength: 1200 },
  topics: [{ label: String, score: Number }],
  suggestedKnowledgeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Knowledge' }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  approvedTopic: { type: String, default: '' },
  approvedKnowledgeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Knowledge' }],
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

AITrainingReviewSchema.index({ status: 1, createdAt: -1 });

export const AITrainingReview = mongoose.model('AITrainingReview', AITrainingReviewSchema);
