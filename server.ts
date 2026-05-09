
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserRole, AccountStatus, HealthGoal, Permission, AuditLogType } from './types.ts';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { logger } from './src/utils/logger.ts';
import { migrationService } from './src/services/migrationService.ts';
import { ttsService } from './src/services/ttsService.ts';
import { configService } from './src/services/configService.ts';
import { cryptoUtils } from './src/utils/cryptoUtils.ts';
import { audioUtils } from './src/utils/audioUtils.ts';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket Server Logging
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  logger.ws(`New connection from ${ip}. Total clients: ${wss.clients.size}`);
  
  ws.on('message', (data) => {
    logger.ws(`Received message from ${ip}: ${data}`);
  });

  ws.on('close', () => {
    logger.ws(`Connection closed for ${ip}. Remaining clients: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    logger.error('WS', `Error from ${ip}: ${err.message}`);
  });
});

// Broadcast to all connected Magic Mirrors
const broadcastToMirrors = (type: string, data: any) => {
  logger.ws(`Broadcasting ${type} to ${wss.clients.size} mirrors...`);
  const message = JSON.stringify({ type, data });
  let count = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      count++;
    }
  });
  logger.ws(`Successfully sent ${type} to ${count} active mirrors.`);
};

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);

// Global Request Logger for API and MM endpoints
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/MM/')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.http(req.method, req.path, res.statusCode, duration, req.ip || 'unknown');
    });
  }
  next();
});

const ENV_API_KEYS = [
  process.env.API_KEY, 
  process.env.API_KEY_2, 
  process.env.API_KEY_3,
  process.env.GEMINI_API_KEY
].filter(k => !!k);
const keyCooldowns = new Map<string, number>(); 

// Models
const GeminiKey = mongoose.model('GeminiKey', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, default: 'Unnamed Key' },
  isActive: { type: Boolean, default: true },
  failCount: { type: Number, default: 0 },
  cooldownUntil: { type: Date, default: null },
  lastUsed: { type: Date, default: null }
}, { timestamps: true }));

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
    
    // 1. Lấy tất cả key từ Database có isActive = true
    let dbKeys = await GeminiKey.find({ isActive: true });
    
    // 2. Lọc bỏ các key đang cooldown
    let availableKeys = dbKeys.filter(k => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() < now);
    
    let selectedKeyString = '';
    let isFromDb = false;
    let dbKeyObj: any = null;

    if (availableKeys.length > 0) {
      // Chọn ngẫu nhiên từ DB
      dbKeyObj = availableKeys[Math.floor(Math.random() * availableKeys.length)];
      selectedKeyString = dbKeyObj.key;
      isFromDb = true;
    } else {
      // 3. Fallback sang ENV keys nếu DB không có key nào khả dụng
      const fallbackKeys = ENV_API_KEYS.filter(k => {
        const cooldownUntil = keyCooldowns.get(k) || 0;
        return now > cooldownUntil;
      });

      if (fallbackKeys.length === 0) {
        throw new Error("Tất cả API Keys (DB & ENV) hiện đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau.");
      }
      selectedKeyString = fallbackKeys[Math.floor(Math.random() * fallbackKeys.length)]!;
      isFromDb = false;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: selectedKeyString });
      const response = await ai.models.generateContent({ model: modelName, ...payload });
      
      // Update last used if from DB
      if (isFromDb && dbKeyObj) {
        await GeminiKey.findByIdAndUpdate(dbKeyObj._id, { lastUsed: new Date(), failCount: 0 });
      }
      
      return response;
    } catch (err: any) {
      const isOverloaded = err.message?.includes('503') || err.message?.includes('overloaded');
      const isRateLimited = err.message?.includes('429') || err.message?.includes('quota');
      
      if (isOverloaded || isRateLimited) {
        const cooldownTime = now + 60000; // Phạt 1 phút
        if (isFromDb && dbKeyObj) {
          await GeminiKey.findByIdAndUpdate(dbKeyObj._id, { 
            cooldownUntil: new Date(cooldownTime),
            $inc: { failCount: 1 }
          });
        } else {
          keyCooldowns.set(selectedKeyString, cooldownTime);
        }
        
        if (attempt < retries) continue; 
      }
      throw err;
    }
  }
}

// AI API Endpoints
app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });
    const payload = {
      contents: [{ parts: [{ text: "Phân tích ảnh kết quả đo chỉ số InBody hoặc cân điện tử này. Trích xuất chính xác các số liệu. Nếu không thấy số liệu, hãy để là 0. Trả về JSON." }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }] ,
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

// Admin Gemini Key Endpoints
app.get('/api/admin/env-keys', (req, res) => {
  const keys = [
    { label: 'API_KEY (Primary)', key: process.env.API_KEY },
    { label: 'API_KEY_2 (Backup)', key: process.env.API_KEY_2 },
    { label: 'API_KEY_3 (Backup)', key: process.env.API_KEY_3 }
  ].filter(k => !!k.key).map(k => ({
    label: k.label,
    key: k.key, // Chúng ta vẫn trả về key full để frontend check trùng lặp (Admin only)
    display: `${k.key!.substring(0, 6)}••••${k.key!.substring(k.key!.length - 4)}`
  }));
  res.json(keys);
});

app.get('/api/admin/gemini-keys', async (req, res) => {
  try {
    const keys = await GeminiKey.find().sort({ createdAt: -1 });
    res.json(keys.map(k => ({ ...k.toObject(), id: k._id })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/gemini-keys', async (req, res) => {
  try {
    const { key, label } = req.body;
    
    // Check trùng lặp với ENV
    if (ENV_API_KEYS.includes(key)) {
      return res.status(400).json({ message: "KEY ĐÃ TỒN TẠI TRONG DANH SÁCH ENV" });
    }

    const newKey = new GeminiKey({ key, label });
    await newKey.save();
    res.json({ ...newKey.toObject(), id: newKey._id });
  } catch (err: any) { 
    res.status(400).json({ message: "KEY ĐÃ TỒN TẠI HOẶC KHÔNG HỢP LỆ" }); 
  }
});

app.delete('/api/admin/gemini-keys/:id', async (req, res) => {
  try {
    await GeminiKey.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.put('/api/admin/gemini-keys/:id/toggle', async (req, res) => {
  try {
    const { isActive } = req.body;
    await GeminiKey.findByIdAndUpdate(req.params.id, { isActive });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/gemini-keys/check', async (req, res) => {
  try {
    const { key } = req.body;
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'ping',
    });
    if (response && response.text) res.json({ status: 'ok' });
    else throw new Error("No response");
  } catch (err: any) {
    res.status(400).json({ message: "Key không hoạt động: " + err.message });
  }
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
  healthGoals: { type: [String], default: [] },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] },
  avatar: String,
  avatarHash: String,
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
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  res.json({ exists: !!user });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const imgData = await uploadToImgBB(avatar);
    const finalAvatar = imgData?.url || avatar;
    const newUser = new User({ 
      ...rest, 
      username: username.toLowerCase().trim(), 
      email: email.toLowerCase().trim(), 
      password: hashPassword(password), 
      isPasswordEncrypted: true, 
      avatar: finalAvatar,
      avatarHash: cryptoUtils.generateAvatarHash(finalAvatar)
    });
    await newUser.save();
    
    broadcastToMirrors('user:created', { 
      username: newUser.username, 
      fullName: newUser.fullName, 
      avatar: newUser.avatar, 
      avatarHash: (newUser as any).avatarHash 
    });

    // Audit Log
    const log = new AuditLog({
      actorId: newUser._id, actorName: newUser.fullName, type: AuditLogType.REGISTER,
      details: `Đăng ký tài khoản mới: @${newUser.username}`, timestamp: new Date().toISOString()
    });
    await log.save();

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
  try {
    const data = req.body;
    if (data.avatar && data.avatar.startsWith('data:image')) {
      const imgData = await uploadToImgBB(data.avatar);
      if (imgData) {
        data.avatar = imgData.url;
        console.log(`[USER] Avatar uploaded to ImgBB: ${imgData.url}`);
      }
    }
    
    // Nếu có mật khẩu mới, thực hiện hash
    if (data.password && data.password.trim() !== '') {
      data.password = hashPassword(data.password);
      data.isPasswordEncrypted = true;
    } else {
      // Nếu password gửi lên là rỗng hoặc không có, xóa khỏi data để tránh ghi đè mật khẩu cũ bằng rỗng
      delete data.password;
    }

    if (data.avatar) {
      data.avatarHash = cryptoUtils.generateAvatarHash(data.avatar);
    }

    const u = await User.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!u) return res.status(404).json({ message: 'User not found' });
    
    broadcastToMirrors('user:updated', { 
      username: u.username, 
      fullName: u.fullName, 
      avatar: u.avatar, 
      avatarHash: (u as any).avatarHash 
    });

    const result = u.toObject();
    delete result.password;
    res.json({ ...result, id: u._id });
  } catch (err: any) {
    console.error(`[USER] Update error: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
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

// Magic Mirror (MM) Integration Endpoints

app.get('/MM/config', async (req, res) => {
  try {
    const config = await configService.getMirrorConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/tts/greeting/:name', async (req, res) => {
  const name = req.params.name;
  const customPrompt = req.query.prompt as string;
  
  try {
    const audioBuffer = await ttsService.generateGreeting(name, customPrompt, callAIWithRetry);
    
    if (audioBuffer) {
      res.set('Content-Type', 'audio/wav');
      res.send(audioBuffer);
    } else {
      // If audio generation fails (e.g. location blocked), return 204 No Content
      // This prevents the Magic Mirror from throwing a network error
      res.status(204).end();
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/MM/:username/info', async (req, res) => {
  const username = req.params.username.toLowerCase().trim();
  console.log(`[MM] Request info for user: ${username} from ${req.ip}`);
  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`[MM] User not found: ${username}`);
      return res.status(404).json({ message: 'User not found' });
    }
    const u = user.toObject();
    delete u.password;
    console.log(`[MM] Successfully returned info for: ${username}`);
    res.json({ ...u, id: user._id });
  } catch (err: any) { 
    console.error(`[MM] Info error for ${username}:`, err.message);
    res.status(500).json({ message: err.message }); 
  }
});

app.get('/MM/:username/metrics/:n', async (req, res) => {
  const username = req.params.username.toLowerCase().trim();
  const n = parseInt(req.params.n) || 1;
  console.log(`[MM] Request metrics for user: ${username} (limit: ${n}) from ${req.ip}`);
  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`[MM] User not found for metrics: ${username}`);
      return res.status(404).json({ message: 'User not found' });
    }
    
    const metrics = await Metric.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(n);
    
    console.log(`[MM] Successfully returned ${metrics.length} metrics for: ${username}`);
    res.json(metrics.map(m => ({ ...m.toObject(), id: m._id })));
  } catch (err: any) { 
    console.error(`[MM] Metrics error for ${username}:`, err.message);
    res.status(500).json({ message: err.message }); 
  }
});

app.get('/MM/users/sync', async (req, res) => {
  try {
    const users = await User.find({}, 'username fullName avatar avatarHash updatedAt');
    const usersWithAvatar = users.filter(u => !!u.avatar);
    console.log(`[MM] Sync request from ${req.ip}. Total users: ${users.length}, Users with avatar: ${usersWithAvatar.length}`);
    
    res.json(users.map(u => ({
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      avatarHash: (u as any).avatarHash,
      updatedAt: (u as any).updatedAt
    })));
  } catch (err: any) { 
    console.error(`[MM] Sync error: ${err.message}`);
    res.status(500).json({ message: err.message }); 
  }
});

app.use(express.static('.') as any);
app.get('*', (req, res) => res.sendFile(path.resolve('index.html')));

server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  logger.info('SYSTEM', `Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('SYSTEM', `Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  
  // Migration: Populate avatarHash for existing users
  await migrationService.runAvatarHashMigration(User);
});
