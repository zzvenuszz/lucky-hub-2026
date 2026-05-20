import mongoose from 'mongoose';

const PostSchema = new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrls: [String],
  images: [{ url: String, deleteUrl: String }],
  timestamp: String,
  reactions: [{
    userId: String,
    userName: String,
    userAvatar: String,
    type: { type: String },
    count: { type: Number, default: 0 }
  }],
  hashtags: [String],
}, { timestamps: true });

export const Post = mongoose.model('Post', PostSchema);