
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { GoogleGenAI, Type } from "@google/genai";
import { UserRole, AccountStatus, HealthGoal, Permission, AuditLogType } from './types.ts';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);

// --- 1. ĐỊNH NGHĨA MODELS TRƯỚC (QUAN TRỌNG) ---

const GeminiKey = mongoose.model('GeminiKey', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'error', 'cooldown'], default: 'active' },
  lastUsed: Date
}, { timestamps: true }));

const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  targetId: String,
  targetName: String,
  type: { type: String, required: true },
  details: { type: String, required: true },
  timestamp: { type: String, required: true }
}, { timestamps: true }));

const User = mongoose.model('User', new mongoose.Schema({
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
  badges: { type: [String], default: [] }
}, { timestamps: true }));

const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number, bodyFat: Number, boneMinerals: Number, waterPercent: Number, muscleMass: Number,
  balanceIndex: { type: Number, default: 0 }, energy: Number, bioAge: Number, visceralFat: Number
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

// --- 2. LOGIC GEMINI KEYS ---

const ENV_API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const keyCooldowns = new Map<string, number>(); 

async function getActiveGeminiKeys(): Promise<string[]> {
  try {
    const dbKeys = await GeminiKey.find({ status: { $ne: 'error' } });
    if (dbKeys && dbKeys.length > 0) return dbKeys.map(k => k.key);
  } catch (err) {
    console.error('❌ [Gemini] Database Keys error, fallback to ENV.');
  }
  return ENV_API_KEYS as string[];
}

async function validateGeminiKeys() {
  const keysToTest = await getActiveGeminiKeys();
  for (const key of keysToTest) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({ model: 'gemini-3-flash-lite-latest', contents: 'ping' });
      await GeminiKey.findOneAndUpdate({ key }, { status: 'active' });
    } catch (err) {
      await GeminiKey.findOneAndUpdate({ key }, { status: 'error' });
    }
  }
}

async function callAIWithRetry(requestId: string, modelName: string, payload: any, retries = 3): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const allKeys = await getActiveGeminiKeys();
    const availableKeys = allKeys.filter(k => (keyCooldowns.get(k) || 0) < Date.now());
    if (availableKeys.length === 0) {
      if (attempt === retries) throw new Error("Tất cả Keys đang bận.");
      await new Promise(r => setTimeout(r, 2000)); continue;
    }
    const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      return await ai.models.generateContent({ model: modelName, ...payload });
    } catch (err: any) {
      keyCooldowns.set(selectedKey, Date.now() + 30000);
      if (attempt < retries) continue; throw err;
    }
  }
}

// --- 3. ENDPOINTS ---

app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    const payload = {
      contents: [{ parts: [{ text: "Phân tích ảnh InBody. Trả về JSON." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER }, waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER }, energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER }, date: { type: Type.STRING } }
        }
      }
    };
    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    res.json(JSON.parse(response.text));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    const payload = {
      contents: [{ parts: [{ text: "Trích xuất danh sách JSON." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { date: { type: Type.STRING }, weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER }, waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER }, energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER } }
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

app.get('/api/config/gemini-keys', async (req, res) => res.json(await GeminiKey.find().sort({ createdAt: -1 })));
app.post('/api/config/gemini-keys', async (req, res) => {
  const { key, name } = req.body;
  const newKey = new GeminiKey({ key, name, status: 'active' });
  await newKey.save(); res.json(newKey);
});
app.delete('/api/config/gemini-keys/:id', async (req, res) => {
  await GeminiKey.findByIdAndDelete(req.params.id); res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] });
  if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
  const u = user.toObject(); delete u.password; res.json({ ...u, id: user._id });
});

app.get('/api/users', async (req, res) => res.json((await User.find()).map(u => ({ ...u.toObject(), id: u._id }))));
app.get('/api/metrics/:userId', async (req, res) => res.json((await Metric.find({ userId: req.params.userId }).sort({ date: -1 })).map(m => ({ ...m.toObject(), id: m._id }))));
app.post('/api/metrics', async (req, res) => {
  const m = new Metric(req.body); await m.save(); res.json({ ...m.toObject(), id: m._id });
});

app.get('/api/knowledge', async (req, res) => res.json((await Knowledge.find()).map(i => ({...i.toObject(), id: i._id}))));
app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body); await k.save(); res.json({ ...k.toObject(), id: k._id });
});
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/rules', async (req, res) => res.json((await Rule.find()).map(i => ({...i.toObject(), id: i._id}))));
app.post('/api/rules', async (req, res) => {
  const r = new Rule(req.body); await r.save(); res.json({ ...r.toObject(), id: r._id });
});
app.delete('/api/rules/:id', async (req, res) => { await Rule.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true }));
});

app.get('/api/posts', async (req, res) => res.json((await Post.find().sort({ createdAt: -1 })).map(p => ({ ...p.toObject(), id: p._id }))));
app.post('/api/posts', async (req, res) => {
  const p = new Post(req.body); await p.save(); res.json({ ...p.toObject(), id: p._id });
});

// --- 4. KHỞI CHẠY ---

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function initDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub');
    console.log('✅ Connected to MongoDB');
    await validateGeminiKeys();
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

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
      res.type('application/javascript').send(result.code); return;
    } catch (err) { return res.status(500).send('Error compiling file'); }
  }
  next();
});

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
