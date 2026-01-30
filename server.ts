
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

// Sửa lỗi: Khai báo biến PORT từ biến môi trường hoặc mặc định 3000
const PORT = process.env.PORT || 3000;

const app = express();

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '10mb' }) as any);

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const keyCooldowns = new Map<string, number>();

/**
 * KIỂM TRA TRẠNG THÁI GEMINI API KEYS
 */
async function validateGeminiKeys() {
  console.log('🔍 [Gemini] Đang kiểm tra API Keys...');
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i]!;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'ping' });
      console.log(`✅ [Gemini] Key #${i + 1} Sẵn sàng.`);
    } catch (err: any) {
      console.error(`❌ [Gemini] Key #${i + 1} Lỗi: ${err.message}`);
    }
  }
}

/**
 * HÀM ĐIỀU PHỐI AI THÔNG MINH
 */
async function callAIWithRetry(requestId: string, modelName: string, payload: any, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const now = Date.now();
    const availableKeys = API_KEYS.filter(k => (keyCooldowns.get(k) || 0) < now);

    if (availableKeys.length === 0) throw new Error("Hệ thống AI đang bảo trì (Cooldown).");

    const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      return await ai.models.generateContent({ model: modelName, ...payload });
    } catch (err: any) {
      if (err.message?.includes('503') || err.message?.includes('429')) {
        keyCooldowns.set(selectedKey, now + 30000);
        if (attempt < retries) continue;
      }
      throw err;
    }
  }
}

/**
 * DB MODELS
 */
const User = mongoose.model('User', new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, default: '' },
  birthDate: String, height: { type: Number, default: 0 }, weight: { type: Number, default: 0 },
  gender: { type: String, default: 'Nam' }, healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] }, avatar: String, isPasswordEncrypted: { type: Boolean, default: false },
  badges: { type: [String], default: [] }, resetPasswordToken: String, resetPasswordExpires: Date
}, { timestamps: true }));

const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, weight: Number, bodyFat: Number, boneMinerals: Number, waterPercent: Number, muscleMass: Number, balanceIndex: { type: Number, default: 0 }, energy: Number, bioAge: Number, visceralFat: Number
}, { timestamps: true }));

const Post = mongoose.model('Post', new mongoose.Schema({
  userId: String, userFullName: String, userAvatar: String, userBadges: [String],
  content: String, imageUrls: [String], images: [{ url: String, deleteUrl: String }],
  timestamp: String, reactions: [{ userId: String, userName: String, userAvatar: String, type: { type: String }, count: { type: Number, default: 0 } }]
}, { timestamps: true }));

const Chat = mongoose.model('Chat', new mongoose.Schema({
  id: { type: String, required: true, unique: true }, memberId: { type: String, required: true }, coachId: { type: String, required: true },
  messages: [{ id: String, senderId: String, senderName: String, senderRole: String, content: String, timestamp: String, imageUrl: String }]
}, { timestamps: true }));

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));
const Rule = mongoose.model('Rule', new mongoose.Schema({ content: String }));

/**
 * API ROUTES
 */
app.post('/api/check-email', async (req, res) => {
  try {
    const { email, excludeUserId } = req.body;
    const query: any = { email: email.toLowerCase().trim() };
    if (excludeUserId) query._id = { $ne: excludeUserId };
    const exists = await User.findOne(query);
    res.json({ exists: !!exists });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, ...rest } = req.body;
    const newUser = new User({ ...rest, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password: hashPassword(password), isPasswordEncrypted: true });
    await newUser.save();
    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
    const u = user.toObject(); delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
});

app.put('/api/users/:id', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ ...u?.toObject(), id: u?._id });
});

app.get('/api/posts', async (req, res) => {
  const p = await Post.find().sort({ createdAt: -1 });
  res.json(p.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/posts', async (req, res) => {
  const p = new Post(req.body); await p.save();
  res.json({ ...p.toObject(), id: p._id });
});

app.put('/api/posts/:id/react', async (req, res) => {
  try {
    const { userId, type, userName, userAvatar } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Not found' });
    let reactions = (post.reactions as any) || [];
    if (type === 'clear') { reactions = reactions.filter((r: any) => r.userId !== userId); }
    else {
      const idx = reactions.findIndex((r: any) => r.userId === userId && r.type === type);
      if (idx > -1) reactions[idx].count += 1;
      else reactions.push({ userId, type, userName, userAvatar, count: 1 });
    }
    post.reactions = reactions; await post.save();
    res.json({ ...post.toObject(), id: post._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/metrics/:userId', async (req, res) => {
  const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
});

app.post('/api/metrics', async (req, res) => {
  const m = new Metric(req.body); await m.save();
  res.json({ ...m.toObject(), id: m._id });
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const metrics = await Metric.insertMany(req.body);
    res.json(metrics);
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    const payload = {
      contents: [{ parts: [{ text: "Extract InBody metrics to JSON." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER },
            energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER }, date: { type: Type.STRING }
          }
        }
      }
    };
    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    res.json(JSON.parse(response.text));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/ai/coach', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    const payload = { contents: [...history, { role: 'user', parts }], config: { systemInstruction } };
    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    res.json({ text: response.text });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/knowledge', async (req, res) => res.json((await Knowledge.find()).map(i => ({...i.toObject(), id: i._id}))));
app.get('/api/rules', async (req, res) => res.json((await Rule.find()).map(i => ({...i.toObject(), id: i._id}))));
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true }));
});

function hashPassword(password: string): string { return crypto.createHash('sha256').update(password).digest('hex'); }

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));

async function initDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ Connected to MongoDB');
    await validateGeminiKeys();
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

// Sửa lỗi: Sử dụng biến PORT đã được khai báo ở đầu file
app.listen(PORT, () => console.log(`🚀 Lucky Hub is LIVE on port ${PORT}`));
