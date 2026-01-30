
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { GoogleGenAI, Type } from "@google/genai";
import { UserRole, AccountStatus, HealthGoal, Permission } from './types.ts';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const getAIClient = () => {
  const key = API_KEYS[Math.floor(Math.random() * API_KEYS.length)];
  return new GoogleGenAI({ apiKey: key || '' });
};

// Quản lý người dùng Online
const onlineUsers = new Map<string, string>(); // userId -> socketId

/**
 * HÀM TIỆN ÍCH UPLOAD ẢNH LÊN IMGBB
 */
async function uploadToImgBB(base64Data: string | undefined): Promise<{url: string, deleteUrl: string} | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return null;
    const base64Image = base64Data.split(',')[1];
    const formData = new URLSearchParams();
    formData.append('image', base64Image);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const result = await response.json();
    if (result.success) {
      return { url: result.data.url, deleteUrl: result.data.delete_url };
    }
    return null;
  } catch (error: any) {
    console.error('❌ [ImgBB] Error:', error.message);
    return null;
  }
}

/**
 * HÀM XÓA ẢNH TRÊN CDN
 */
async function purgeImageFromCDN(deleteUrl: string, retries = 3): Promise<boolean> {
  if (!deleteUrl || !deleteUrl.includes('ibb.co')) return false;
  try {
    const urlParts = deleteUrl.split('/').filter(p => p.length > 0);
    const imageHash = urlParts.pop();
    const imageId = urlParts.pop();
    if (!imageId || !imageHash) return false;
    const formData = new URLSearchParams();
    formData.append('pathname', `/${imageId}/${imageHash}`);
    formData.append('action', 'delete');
    formData.append('delete', 'image');
    formData.append('from', 'resource');
    formData.append('deleting[id]', imageId);
    formData.append('deleting[hash]', imageHash);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://ibb.co/json', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const result = await response.json();
      if (result.status_code === 200) return true;
    }
    throw new Error(`ImgBB API error ${response.status}`);
  } catch (e: any) {
    if (retries > 1) {
      await new Promise(res => setTimeout(res, 2000));
      return purgeImageFromCDN(deleteUrl, retries - 1);
    }
    return false;
  }
}

// Middleware biên dịch TypeScript/JSX trên luồng (Crucial for fix blank page)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  
  const rootDir = path.resolve();
  let filePath = path.join(rootDir, req.path);
  
  // Xử lý các file .ts và .tsx
  let targetFile = null;
  if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        targetFile = filePath;
    }
  } else if (fs.existsSync(filePath + '.ts')) {
    targetFile = filePath + '.ts';
  } else if (fs.existsSync(filePath + '.tsx')) {
    targetFile = filePath + '.tsx';
  }

  if (targetFile) {
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const result = transform(content, {
        transforms: ['typescript', 'jsx'],
        production: false,
        jsxRuntime: 'automatic',
      });
      res.type('application/javascript').send(result.code);
      return;
    } catch (err) {
      console.error(`❌ Lỗi biên dịch file ${targetFile}:`, err);
      return res.status(500).send('Error compiling file');
    }
  }
  next();
});

// Schemas & Models
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: String,
  birthDate: String,
  height: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  gender: { type: String, default: 'Nam' },
  healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] },
  avatar: String,
  badges: { type: [String], default: [] }
}, { timestamps: true }));

const Post = mongoose.model('Post', new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrls: [String], 
  images: [{ url: String, deleteUrl: String }], 
  timestamp: String,
  reactions: [{ userId: String, userName: String, userAvatar: String, type: { type: String }, count: { type: Number, default: 0 } }]
}, { timestamps: true }));

const Chat = mongoose.model('Chat', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  coachId: { type: String, required: true },
  messages: [{ id: String, senderId: String, senderName: String, senderRole: String, content: String, timestamp: String, imageUrl: String }]
}, { timestamps: true }));

const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number, bodyFat: Number, boneMinerals: Number, waterPercent: Number, muscleMass: Number, balanceIndex: Number, energy: Number, bioAge: Number, visceralFat: Number
}, { timestamps: true }));

// Socket.IO Logic
io.on('connection', (socket) => {
  socket.on('register_online', (userId: string) => {
    onlineUsers.set(userId, socket.id);
    io.emit('online_status_change', Array.from(onlineUsers.keys()));
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        onlineUsers.delete(uid);
        io.emit('online_status_change', Array.from(onlineUsers.keys()));
        break;
      }
    }
  });

  socket.on('send_message', async (data: { chatId: string, message: any }) => {
    const { chatId, message } = data;
    const chat = await Chat.findOne({ id: chatId });
    if (chat) {
      chat.messages.push(message);
      await chat.save();
      const targetUserId = message.senderId === chat.memberId ? chat.coachId : chat.memberId;
      const targetSocketId = onlineUsers.get(targetUserId);
      if (targetSocketId) io.to(targetSocketId).emit('receive_message', { chatId, message });
    }
  });

  socket.on('post_reaction', (data: { postId: string, updatedPost: any }) => {
    socket.broadcast.emit('update_post_ui', data);
  });
});

// Database Connection
async function initDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub');
    console.log('✅ Connected to MongoDB');
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

// API Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', onlineCount: onlineUsers.size }));

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashed = crypto.createHash('sha256').update(password).digest('hex');
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashed) return res.status(401).json({ message: 'Invalid credentials' });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const hashed = crypto.createHash('sha256').update(password).digest('hex');
    const imgData = await uploadToImgBB(avatar);
    const newUser = new User({ ...rest, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password: hashed, avatar: imgData?.url || avatar });
    await newUser.save();
    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id, isOnline: onlineUsers.has(String(item._id)) })));
});

app.put('/api/users/:id', async (req, res) => {
  const data = req.body;
  if (data.avatar && data.avatar.startsWith('data:image')) {
    const imgData = await uploadToImgBB(data.avatar);
    if (imgData) data.avatar = imgData.url;
  }
  const u = await User.findByIdAndUpdate(req.params.id, data, { new: true });
  res.json({ ...u?.toObject(), id: u?._id });
});

app.get('/api/posts', async (req, res) => {
  const p = await Post.find().sort({ createdAt: -1 });
  res.json(p.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/posts', async (req, res) => {
  const { imageUrls, ...data } = req.body;
  const uploadedImages = [];
  if (imageUrls && Array.isArray(imageUrls)) {
    for (const img of imageUrls) {
      if (img.startsWith('data:image')) {
        const imgData = await uploadToImgBB(img);
        if (imgData) uploadedImages.push(imgData);
      }
    }
  }
  const p = new Post({ ...data, images: uploadedImages, imageUrls: uploadedImages.map(i => i.url) });
  await p.save();
  io.emit('new_post', { ...p.toObject(), id: p._id });
  res.json({ ...p.toObject(), id: p._id });
});

app.put('/api/posts/:id/react', async (req, res) => {
  try {
    const { userId, type, userName, userAvatar } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    let reactions = (post.reactions as any) || [];
    if (type === 'clear') {
      reactions = reactions.filter((r: any) => r.userId !== userId);
    } else {
      const index = reactions.findIndex((r: any) => r.userId === userId && r.type === type);
      if (index > -1) reactions[index].count += 1;
      else reactions.push({ userId, type, userName, userAvatar, count: 1 });
    }
    post.reactions = reactions;
    await post.save();
    const result = { ...post.toObject(), id: post._id };
    io.emit('update_post_ui', { postId: post._id, updatedPost: result });
    res.json(result);
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/metrics/:userId', async (req, res) => {
  const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
});

app.post('/api/metrics', async (req, res) => {
  const m = new Metric(req.body);
  await m.save();
  res.json({ ...m.toObject(), id: m._id });
});

app.post('/api/ai/coach', async (req, res) => {
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const ai = getAIClient();
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts }],
      config: { systemInstruction }
    });
    res.json({ text: response.text });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Phục vụ các file tĩnh khác (sau khi đã xử lý biên dịch)
app.use(express.static('.') as any);

// SPA Routing: Luôn gửi index.html cho các route không phải file
app.get(/^[^\.]*$/, (req, res) => {
  res.sendFile(path.resolve('index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Real-time Server running on port ${PORT}`));
