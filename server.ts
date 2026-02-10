
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

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const healthyKeys: string[] = [];
const keyCooldowns = new Map<string, number>(); 

async function validateGeminiKeys() {
  console.log('🔍 [Gemini] Đang kiểm tra trạng thái các API Keys khởi động...');
  healthyKeys.length = 0;
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i]!;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'ping',
      });
      if (response && response.text) {
        console.log(`✅ [Gemini] Key #${i + 1} (${key.substring(0, 6)}...): HOẠT ĐỘNG`);
        healthyKeys.push(key);
      }
    } catch (err: any) {
      console.error(`❌ [Gemini] Key #${i + 1} (${key.substring(0, 6)}...): LỖI BAN ĐẦU - ${err.message}`);
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
    const availableKeys = API_KEYS.filter(k => {
      const cooldownUntil = keyCooldowns.get(k) || 0;
      return now > cooldownUntil;
    });
    if (availableKeys.length === 0) {
      throw new Error("Tất cả API Keys hiện đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau 30 giây.");
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
        keyCooldowns.set(selectedKey, now + 30000);
        if (attempt < retries) continue; 
      }
      throw err;
    }
  }
}

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

async function purgeImageFromCDN(deleteUrl: string, retries = 3): Promise<boolean> {
  if (!deleteUrl || !deleteUrl.includes('ibb.co')) return false;
  try {
    const urlParts = deleteUrl.split('/').filter(p => p.length > 0);
    const imageHash = urlParts.pop();
    const imageId = urlParts.pop();
    const params = new URLSearchParams();
    params.append('pathname', `/${imageId}/${imageHash}`);
    params.append('action', 'delete');
    params.append('delete', 'image');
    params.append('from', 'resource');
    params.append('deleting[id]', imageId!);
    params.append('deleting[hash]', imageHash!);
    const response = await fetch('https://ibb.co/json', { method: 'POST', body: params, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const result = await response.json();
    return result.status_code === 200;
  } catch (e: any) {
    if (retries > 1) return purgeImageFromCDN(deleteUrl, retries - 1);
    return false;
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

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
    console.log(`📝 [Audit] @${newUser.username} vừa đăng ký tài khoản mới.`);

    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.status === AccountStatus.SUSPENDED) return res.status(403).json({ message: "Tài khoản của bạn bị lỗi. Vui lòng liên hệ với Quản trị viên hệ thống hoặc Nhóm dinh dưỡng bạn đang sinh hoạt để được hỗ trợ." });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/audit-logs', async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
  res.json(logs);
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
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

  // Audit Log
  const log = new AuditLog({
    actorId: p.userId, actorName: p.userFullName, type: AuditLogType.POST_CREATE,
    details: `Đăng bài viết mới: "${p.content?.substring(0, 50)}..."`, timestamp: new Date().toISOString()
  });
  await log.save();
  console.log(`📝 [Audit] ${p.userFullName} vừa đăng một bài viết mới.`);

  res.json({ ...p.toObject(), id: p._id });
});

app.get('/api/metrics/:userId', async (req, res) => {
  const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
});

app.post('/api/metrics', async (req, res) => {
  const { actorId, actorName, ...metricData } = req.body;
  const m = new Metric(metricData);
  await m.save();

  // Xác định Target
  const target = await User.findById(metricData.userId);
  const isHelp = actorId && actorId !== metricData.userId.toString();
  
  const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
  const details = isHelp 
    ? `Cập nhật chỉ số giúp hội viên ${target?.fullName}`
    : `Tự cập nhật chỉ số cá nhân`;

  const log = new AuditLog({
    actorId: actorId || metricData.userId, actorName: actorName || target?.fullName || 'Hội viên',
    targetId: metricData.userId, targetName: target?.fullName,
    type: logType, details, timestamp: new Date().toISOString()
  });
  await log.save();

  if (isHelp) {
    console.log(`📝 [Audit] ${actorName} vừa cập nhật chỉ số giúp hội viên ${target?.fullName}.`);
  } else {
    console.log(`📝 [Audit] ${target?.fullName} vừa tự cập nhật chỉ số.`);
  }

  res.json({ ...m.toObject(), id: m._id });
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const { metrics, actorId, actorName } = req.body;
    if (!Array.isArray(metrics) || metrics.length === 0) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });

    const targetUserId = metrics[0].userId;
    const target = await User.findById(targetUserId);

    const operations = metrics.map(m => ({
      updateOne: { filter: { userId: m.userId, date: m.date }, update: { $set: m }, upsert: true }
    }));
    const result = await Metric.bulkWrite(operations);

    // Audit Log
    const isHelp = actorId && actorId !== targetUserId.toString();
    const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
    const details = isHelp 
      ? `Cập nhật hàng loạt ${metrics.length} chỉ số giúp hội viên ${target?.fullName}`
      : `Tự cập nhật hàng loạt ${metrics.length} chỉ số cá nhân`;

    const log = new AuditLog({
      actorId: actorId || targetUserId, actorName: actorName || target?.fullName || 'Hội viên',
      targetId: targetUserId, targetName: target?.fullName,
      type: logType, details, timestamp: new Date().toISOString()
    });
    await log.save();

    if (isHelp) {
      console.log(`📝 [Audit] ${actorName} vừa cập nhật hàng loạt ${metrics.length} chỉ số giúp ${target?.fullName}.`);
    } else {
      console.log(`📝 [Audit] ${target?.fullName} vừa tự cập nhật hàng loạt ${metrics.length} chỉ số.`);
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get('/api/knowledge', async (req, res) => res.json((await Knowledge.find()).map(i => ({...i.toObject(), id: i._id}))));
app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body); await k.save();
  res.json({ ...k.toObject(), id: k._id });
});
app.delete('/api/knowledge/:id', async (req, res) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/rules', async (req, res) => res.json((await Rule.find()).map(i => ({...i.toObject(), id: i._id}))));
app.post('/api/rules', async (req, res) => {
  const r = new Rule(req.body); await r.save();
  res.json({ ...r.toObject(), id: r._id });
});
app.delete('/api/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true }));
});

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
