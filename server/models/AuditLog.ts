import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  targetId: String,
  targetName: String,
  type: { type: String, required: true },
  details: { type: String, required: true },
  timestamp: { type: String, required: true },
}, { timestamps: true });

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);