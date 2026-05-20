import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permissions: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Group = mongoose.model('Group', GroupSchema);