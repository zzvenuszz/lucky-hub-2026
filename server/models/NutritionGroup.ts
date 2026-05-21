import mongoose from 'mongoose';

const NutritionGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerName: { type: String, required: true },
  address: { type: String, default: '' },
  coOwners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
  pendingMembers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromNutritionGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NutritionGroup' },
    requestedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

export const NutritionGroup = mongoose.model('NutritionGroup', NutritionGroupSchema);