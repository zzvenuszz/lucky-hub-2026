import mongoose from 'mongoose';
import { AccountStatus } from '../../types.ts';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, default: '' },
  birthDate: String,
  height: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  gender: { type: String, default: 'Nam' },
  healthGoals: { type: [String], default: [] },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] },
  avatar: String,
  avatarHash: String,
  isPasswordEncrypted: { type: Boolean, default: false },
  badges: { type: [String], default: [] },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  nutritionGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NutritionGroup', default: null },
  pendingNutritionGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'NutritionGroup', default: null },
}, { timestamps: true });

export const User = mongoose.model('User', UserSchema);