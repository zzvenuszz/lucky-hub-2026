import mongoose from 'mongoose';
import { MessageType } from '../../types.ts';

const BranchMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  content: { type: String, default: '' },
  timestamp: { type: String, required: true },
  type: { type: String, enum: Object.values(MessageType), default: MessageType.TEXT },
});

const NutritionBranchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nutritionGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'NutritionGroup' }],
  memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
  messages: [BranchMessageSchema],
  lastMessage: {
    content: String,
    senderName: String,
    timestamp: String,
  },
}, { timestamps: true });

export const NutritionBranch = mongoose.model('NutritionBranch', NutritionBranchSchema);