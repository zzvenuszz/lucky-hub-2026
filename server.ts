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

// Fallback Keys from .env
const ENV_API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const keyCooldowns = new Map<string, number>(); 

/**
 * Lấy danh sách API Keys sống từ DB hoặc Fallback về ENV
 */
async function getActiveGeminiKeys(): Promise<string[]> {
  try {
    const dbKeys = await GeminiKey.find({ status: { $ne: 'error' } });
    if (dbKeys && dbKeys.length > 0) {
      return dbKeys.map(k => k.key);
    }
  } catch (err) {
    console.error('❌ [Gemini] Lỗi truy vấn Keys từ Database, sử dụng Fallback ENV.');
  }
  return ENV_API_KEYS as string[];
}

async function validateGeminiKeys() {
  console.log('🔍 [Gemini] Đang kiểm tra trạng thái các API Keys...');
  const keysToTest = await getActiveGeminiKeys();
  
  for (const key of keysToTest) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-lite-latest',
        contents: 'ping',
      });
      if (response && response.text) {
        console.log(`✅ [Gemini] Key (${key.substring(0, 8)}...): HOẠT ĐỘNG`);
        await GeminiKey.findOneAndUpdate({ key }, { status: 'active' });
      }
    } catch (err: any) {
      console.error(`❌ [Gemini] Key (${key.substring(0, 8)}...): LỖI - ${err.message}`);
      await GeminiKey.findOneAndUpdate({ key }, { status: 'error' });
    }
  }
}

async function callAIWithRetry(
  requestId: string,
  modelName: string,
  payload: any,
  retries = 3
): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    const now = Date.now();
    const allKeys = await getActiveGeminiKeys();
    
    const availableKeys = allKeys.filter(k => {
      const cooldownUntil = keyCooldowns.get(k) || 0;
      return now > cooldownUntil;
    });

    if (availableKeys.length === 0) {
      if (attempt === retries) {
        throw new Error("Tất cả API Keys hiện đang quá tải. Vui lòng thử lại sau 30 giây.");
      }
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      const response = await ai.models.generateContent({ model: modelName, ...payload });
      return response;
    } catch (err: any) {
      const isOverloaded = err.message?.includes('503') || err.message?.includes('overloaded');
      const isRateLimited = err.message?.includes('429') || err.message?.includes('quota');
      
      if (isOverloaded || isRateLimited) {
        console.warn(`⚠️ [Gemini] Key (${selectedKey.substring(0, 8)}...) đang bị quá tải, đưa vào danh sách chờ.`);
        keyCooldowns.set(selectedKey, now + 30000); // Chờ 30s
        if (attempt < retries) continue; 
      }
      throw err;
    }
  }
}

// AI Endpoints
app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });
    const payload = {
      contents: [{ parts: [{ text: "Phân tích ảnh kết quả đo chỉ số InBody hoặc cân điện tử này. Trích xuất chính xác các số liệu. Nếu không thấy số liệu, hãy để là 0. Trả về JSON." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
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
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });
    const payload = {
      contents: [{ parts: [{ text: "Trích xuất danh sách JSON nhiều dòng kết quả sức khỏe." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
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

// Admin Config Routes
app.get('/api/config/gemini-keys', async (req, res) => {
  try {
    const keys = await GeminiKey.find().sort({ createdAt: -1 });
    res.json(keys);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/config/gemini-keys', async (req, res) => {
  try {
    const { key, name } = req.body;
    const newKey = new GeminiKey({ key, name, status: 'active' });
    await newKey.save();
    res.json(newKey);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/config/gemini-keys/:id', async (req, res) => {
  try {
    await GeminiKey.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Models & Database connection logic
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

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

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    await validateGeminiKeys();
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

// General Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    res.json({ exists: !!user });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const imgData = await uploadToImgBB(avatar);
    const newUser = new User({ ...rest, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password: hashPassword(password), isPasswordEncrypted: true, avatar: imgData?.url || avatar });
    await newUser.save();
    
    // Audit Log
    const log = new AuditLog({
      actorId: newUser._id, actorName: newUser.fullName, type: AuditLogType.REGISTER,
      details: `Đăng ký tài khoản mới: @${newUser.username}`, timestamp: new Date().toISOString()
    });
    await log.save();
    res.json({ message: 'Success' });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status === AccountStatus.SUSPENDED) return res.status(403).json({ message: "Tài khoản bị khóa." });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
    res.json(logs);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const u = await User.find();
    res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const data = req.body;
    if (data.avatar && data.avatar.startsWith('data:image')) {
      const imgData = await uploadToImgBB(data.avatar);
      if (imgData) data.avatar = imgData.url;
    }
    const u = await User.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json({ ...u?.toObject(), id: u?._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/posts', async (req, res) => {
  try {
    const p = await Post.find().sort({ createdAt: -1 });
    res.json(p.map(i => ({ ...i.toObject(), id: i._id })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/posts', async (req, res) => {
  try {
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
    res.json({ ...p.toObject(), id: p._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/metrics/:userId', async (req, res) => {
  try {
    const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
    res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/metrics', async (req, res) => {
  try {
    const { actorId, actorName, ...metricData } = req.body;
    const m = new Metric(metricData);
    await m.save();
    res.json({ ...m.toObject(), id: m._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const { metrics, actorId, actorName } = req.body;
    if (!Array.isArray(metrics) || metrics.length === 0) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    const operations = metrics.map(m => ({
      updateOne: { filter: { userId: m.userId, date: m.date }, update: { $set: m }, upsert: true }
    }));
    await Metric.bulkWrite(operations);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/knowledge', async (req, res) => {
  try {
    const k = await Knowledge.find();
    res.json(k.map(i => ({...i.toObject(), id: i._id})));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/knowledge', async (req, res) => {
  try {
    const k = new Knowledge(req.body); await k.save();
    res.json({ ...k.toObject(), id: k._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/knowledge/:id', async (req, res) => {
  try {
    await Knowledge.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/rules', async (req, res) => {
  try {
    const r = await Rule.find();
    res.json(r.map(i => ({...i.toObject(), id: i._id})));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/rules', async (req, res) => {
  try {
    const r = new Rule(req.body); await r.save();
    res.json({ ...r.toObject(), id: r._id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    await Rule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/chats', async (req, res) => {
  try {
    const c = await Chat.find();
    res.json(c);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/chats', async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const c = await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true });
    res.json(c);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Helper functions
async function uploadToImgBB(base64Data: string | undefined): Promise<{url: string, deleteUrl: string} | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    const base64Image = base64Data.split(',')[1];
    const params = new URLSearchParams();
    params.append('image', base64Image);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: 'POST', body: params });
    const result = await response.json();
    return result.success ? { url: result.data.url, deleteUrl: result.data.delete_url } : null;
  } catch (error: any) { return null; }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Client logic & server start
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

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));