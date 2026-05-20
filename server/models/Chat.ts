import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  coachId: { type: String, required: true },
  messages: [{
    id: String,
    senderId: String,
    senderName: String,
    senderRole: String,
    content: String,
    timestamp: String,
    type: { type: String, default: 'text' },
    status: { type: String, default: 'sent' },
    imageUrl: String,
    fileUrl: String,
    fileName: String,
    fileSize: Number,
    voiceUrl: String,
    replyTo: {
      messageId: String,
      senderName: String,
      content: String
    },
    reactions: [{
      userId: String,
      userName: String,
      emoji: String,
      timestamp: String
    }],
    editedAt: String,
    meta: {
      chosenBy: String,
      chosenByName: String,
      choice: { type: String, enum: ['tham khảo', 'bỏ qua'] },
      chosenAt: String
    }
  }],
  lastReadBy: { type: Map, of: String },
}, { timestamps: true });

export const Chat = mongoose.model('Chat', ChatSchema);