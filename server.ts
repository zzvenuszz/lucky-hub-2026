
import express from 'express';
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

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any); // Tăng giới hạn để nhận nhiều ảnh base64

/**
 * CẤU HÌNH DỊCH VỤ EMAIL QUA MAILEROO API V2
 */
const MAILEROO_CONFIG = {
  apiKey: process.env.MAILEROO_API_KEY,
  endpoint: 'https://smtp.maileroo.com/api/v2/emails', 
  fromEmail: process.env.SMTP_USER, 
  fromName: "Lucky Hub 2026"
};

/**
 * HÀM TIỆN ÍCH UPLOAD ẢNH LÊN IMGBB
 */
async function uploadToImgBB(base64Data: string | undefined): Promise<string | undefined> {
  if (!base64Data || !base64Data.startsWith('data:image')) return base64Data;

  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return base64Data;

    const base64Image = base64Data.split(',')[1];
    const formData = new URLSearchParams();
    formData.append('image', base64Image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const result = await response.json();
    return result.success ? result.data.url : base64Data;
  } catch (error: any) {
    console.error('❌ [ImgBB] Error:', error.message);
    return base64Data;
  }
}

async function sendMailViaMaileroo(to: string, subject: string, html: string) {
  try {
    const response = await fetch(MAILEROO_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MAILEROO_CONFIG.apiKey || ''
      },
      body: JSON.stringify({
        from: { address: MAILEROO_CONFIG.fromEmail, name: MAILEROO_CONFIG.fromName },
        to: [{ address: to }],
        subject: subject,
        html: html
      })
    });
    return await response.json();
  } catch (error: any) {
    console.error('❌ [Maileroo Error]:', error.message);
    throw error;
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.ts', 'run.js', 'package.json', 'package-lock.json', 'tsconfig.json'];
  const url = req.path.toLowerCase();
  if (forbiddenFiles.some(file => url.endsWith(file)) || url.includes('/.')) {
    return res.status(403).json({ message: 'Access Denied' });
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const rootDir = path.resolve();
  let filePath = path.join(rootDir, req.path);
  let targetFile = null;
  if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) targetFile = filePath;
  else if (fs.existsSync(filePath + '.ts')) targetFile = filePath + '.ts';
  else if (fs.existsSync(filePath + '.tsx')) targetFile = filePath + '.tsx';
  
  if (targetFile && (targetFile.endsWith('.ts') || targetFile.endsWith('.tsx'))) {
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const result = transform(content, { transforms: ['typescript', 'jsx'], production: false, jsxRuntime: 'automatic' });
      res.type('application/javascript').send(result.code);
      return;
    } catch (err) { return res.status(500).send('Error compiling file'); }
  }
  next();
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, default: '' },
  birthDate: String,
  height: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  gender: { type: String, default: 'Nam' },
  healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] },
  avatar: String,
  isPasswordEncrypted: { type: Boolean, default: false },
  badges: { type: [String], default: [] },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number,
  bodyFat: Number,
  boneMinerals: Number,
  waterPercent: Number,
  muscleMass: Number,
  balanceIndex: { type: Number, default: 0 },
  energy: Number,
  bioAge: Number,
  visceralFat: Number
}, { timestamps: true }));

const Post = mongoose.model('Post', new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrls: [String], // Hỗ trợ mảng ảnh
  timestamp: String,
  reactions: [{ 
    userId: String, 
    userName: String, 
    userAvatar: String, 
    type: { type: String }, 
    count: { type: Number, default: 0 } 
  }]
}, { timestamps: true }));

const Chat = mongoose.model('Chat', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  coachId: { type: String, required: true },
  messages: [{ id: String, senderId: String, senderName: String, senderRole: String, content: String, timestamp: String, imageUrl: String }]
}, { timestamps: true }));

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));
const Rule = mongoose.model('Rule', new mongoose.Schema({ content: String }));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

let currentKeyIndex = 0;
async function callAiWithFallback(callFn: (ai: GoogleGenAI) => Promise<any>) {
  const numKeys = API_KEYS.length;
  if (numKeys === 0) throw new Error("No API Keys");
  let lastError = null;
  const startIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % numKeys;
  for (let attempt = 0; attempt < numKeys; attempt++) {
    const index = (startIndex + attempt) % numKeys;
    const key = API_KEYS[index]!;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      return await callFn(ai);
    } catch (err: any) {
      lastError = err;
      if (attempt < numKeys - 1) continue;
    }
  }
  throw lastError;
}

// --- API ---

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

app.post('/api/check-email', async (req, res) => {
  const { email, excludeUserId } = req.body;
  const query: any = { email: email.toLowerCase().trim() };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const exists = await User.findOne(query);
  res.json({ exists: !!exists });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const finalAvatar = await uploadToImgBB(avatar);
    const newUser = new User({ 
      ...rest, 
      username: username.toLowerCase().trim(), 
      email: email.toLowerCase().trim(), 
      password: hashPassword(password), 
      isPasswordEncrypted: true, 
      avatar: finalAvatar 
    });
    await newUser.save();
    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
});

app.put('/api/users/:id', async (req, res) => {
  const data = req.body;
  if (data.avatar) data.avatar = await uploadToImgBB(data.avatar);
  const u = await User.findByIdAndUpdate(req.params.id, data, { new: true });
  res.json({ ...u?.toObject(), id: u?._id });
});

app.get('/api/posts', async (req, res) => {
  const p = await Post.find().sort({ createdAt: -1 });
  res.json(p.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/posts', async (req, res) => {
  const { imageUrls, ...data } = req.body;
  const uploadedUrls = [];
  if (imageUrls && Array.isArray(imageUrls)) {
    for (const img of imageUrls) {
      const url = await uploadToImgBB(img);
      if (url) uploadedUrls.push(url);
    }
  }
  const p = new Post({ ...data, imageUrls: uploadedUrls });
  await p.save();
  res.json({ ...p.toObject(), id: p._id });
});

app.delete('/api/posts/:id', async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.put('/api/posts/:id/react', async (req, res) => {
  try {
    const { userId, type, userName, userAvatar } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    
    let reactions = (post.reactions as any) || [];

    if (type === 'clear') {
      // Xóa tất cả reaction của user này
      reactions = reactions.filter((r: any) => r.userId !== userId);
    } else {
      const index = reactions.findIndex((r: any) => r.userId === userId && r.type === type);
      if (index > -1) {
        reactions[index].count += 1; // Tăng số lần thả
      } else {
        reactions.push({ userId, type, userName, userAvatar, count: 1 });
      }
    }
    
    post.reactions = reactions;
    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

// Reuse existing routes for metrics, knowledge, rules...
app.get('/api/metrics/:userId', async (req, res) => {
  const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
});
app.post('/api/metrics', async (req, res) => {
  const m = new Metric(req.body);
  await m.save();
  res.json({ ...m.toObject(), id: m._id });
});
app.get('/api/knowledge', async (req, res) => {
  const k = await Knowledge.find();
  res.json(k.map(i => ({ ...i.toObject(), id: i._id })));
});
app.get('/api/rules', async (req, res) => {
  const r = await Rule.find();
  res.json(r.map(i => ({ ...i.toObject(), id: i._id })));
});
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true }));
});

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
