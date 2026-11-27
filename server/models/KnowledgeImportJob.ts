import mongoose from 'mongoose';

const KnowledgeImportJobSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued', index: true },
  stage: { type: String, enum: ['queued', 'extracting', 'reading', 'ocr', 'synthesizing', 'saving', 'embedding', 'completed', 'failed'], default: 'queued' },
  pageNumber: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  percent: { type: Number, default: 0, min: 0, max: 100 },
  message: { type: String, default: 'Đang chờ xử lý...' },
  error: { type: String, default: '' },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

KnowledgeImportJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const KnowledgeImportJob = mongoose.model('KnowledgeImportJob', KnowledgeImportJobSchema);
