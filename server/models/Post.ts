import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userFullName: { type: String, required: true },
  userAvatar: String,
  content: { type: String, required: true },
  timestamp: { type: String, required: true },
  editedAt: String,
  parentId: { type: String, default: null },
  taggedUsers: [{
    userId: String,
    userName: String,
  }],
  reactions: [{
    userId: String,
    type: String,
  }],
}, { _id: true });

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
  comments: [CommentSchema],
  commentCount: { type: Number, default: 0 },
}, { timestamps: true });

export const Post = mongoose.model('Post', PostSchema);
