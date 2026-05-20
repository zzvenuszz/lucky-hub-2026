import mongoose from 'mongoose';

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permissions: { type: [String], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

// Đảm bảo chỉ có 1 group mặc định
GroupSchema.index({ isDefault: 1 }, { 
  unique: true, 
  partialFilterExpression: { isDefault: true },
  name: 'unique_default_group'
});

export const Group = mongoose.model('Group', GroupSchema);