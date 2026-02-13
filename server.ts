
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

// --- 1. ĐỊNH NGHĨA MODELS ---
const GeminiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'error', 'cooldown'], default: 'active' },
  lastUsed: Date
}, { timestamps: true });
const GeminiKey = mongoose.models.GeminiKey || mongoose.model('GeminiKey', GeminiKeySchema);

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  targetId: String,
  targetName: String,
  type: { type: String, required: true },
  details: { type: String, required: true },
  timestamp: { type: String, required: true }
}, { timestamps: true });
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);

const UserSchema = new mongoose.Schema({
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
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const MetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number, bodyFat: Number, boneMinerals: Number, waterPercent: Number, muscleMass: Number,
  balanceIndex: { type: Number, default: 0 }, energy: Number, bioAge: Number, visceralFat: Number
}, { timestamps: true });
const Metric = mongoose.models.Metric || mongoose.model('Metric', MetricSchema);

const PostSchema = new mongoose.Schema({
  userId: String, userFullName: String, userAvatar: String, userBadges: [String],
  content: String, imageUrls: [String], images: [{ url: String, deleteUrl: String }],
  timestamp: String, reactions: [{ userId: String, userName: String, userAvatar: String, type: { type: String }, count: { type: Number, default: 0 } }]
}, { timestamps: true });
const Post = mongoose.models.Post || mongoose.model('Post', PostSchema);

const ChatSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, memberId: { type: String, required: true }, coachId: { type: String, required: true },
  messages: [{ id: String, senderId: String, senderName: String, senderRole: String, content: String, timestamp: String, imageUrl: String }]
}, { timestamps: true });
const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

const Knowledge = mongoose.models.Knowledge || mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));
const Rule = mongoose.models.Rule || mongoose.model('Rule', new mongoose.Schema({ content: String }));

// --- 2. LOGIC GEMINI KEYS ---
const ENV_API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const keyCooldowns = new Map<string, number>(); 

async function getActiveGeminiKeys(): Promise<string[]> {
  try {
    const dbKeys = await GeminiKey.find({ status: { $ne: 'error' } } as any);
    if (dbKeys && dbKeys.length > 0) return dbKeys.map(k => k.key);
  } catch (err) { console.error('❌ DB Keys Error:', err); }
  return ENV_API_KEYS as string[];
}

async function validateGeminiKeys() {
  const keysToTest = await getActiveGeminiKeys();
  for (const key of keysToTest) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: 'ping' });
      await (GeminiKey as any).findOneAndUpdate({ key }, { status: 'active' }, {});
    } catch (err) {
      await (GeminiKey as any).findOneAndUpdate({ key }, { status: 'error' }, {});
    }
  }
}

async function callAIWithRetry(modelName: string, contents: any, config?: any, retries = 3): Promise<any> {
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
      return await ai.models.generateContent({ model: modelName, contents, config });
    } catch (err: any) {
      keyCooldowns.set(selectedKey, Date.now() + 30000);
      if (attempt < retries) continue; throw err;
    }
  }
}

// --- 3. UTILS ---
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function logAudit(data: any) {
  try {
    const log = new AuditLog({ ...data, timestamp: new Date().toISOString() });
    await log.save();
  } catch (e) { console.error('Audit Log Error:', e); }
}

// --- 4. ENDPOINTS ---

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }] } as any);
  if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Sai thông tin đăng nhập' });
  const u = user.toObject(); delete u.password; res.json({ ...u, id: user._id });
});

app.post('/api/register', async (req, res) => {
  try {
    const data = req.body;
    const exists = await User.findOne({ $or: [{ username: data.username.toLowerCase() }, { email: data.email.toLowerCase() }] } as any);
    if (exists) return res.status(400).json({ message: 'Username hoặc Email đã tồn tại' });
    const user = new User({ ...data, password: hashPassword(data.password), username: data.username.toLowerCase(), email: data.email.toLowerCase() });
    await user.save();
    await logAudit({ actorId: user._id.toString(), actorName: user.fullName, type: AuditLogType.REGISTER, details: 'Đăng ký tài khoản mới' });
    res.json({ message: 'Đăng ký thành công' });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.post('/api/check-email', async (req, res) => {
  const { email, excludeUserId } = req.body;
  const query: any = { email: email.toLowerCase() };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const user = await User.findOne(query);
  res.json({ exists: !!user });
});

app.get('/api/users', async (req, res) => {
  const users = await User.find();
  res.json(users.map(u => ({ ...u.toObject(), id: u._id })));
});

app.put('/api/users/:id', async (req, res) => {
  const user = await (User as any).findByIdAndUpdate(req.params.id, req.body, { new: true } as any);
  if (!user) return res.status(404).send();
  const u = (user as any).toObject(); delete u.password; res.json({ ...u, id: (user as any)._id });
});

app.delete('/api/users/:id', async (req, res) => {
  await (User as any).findByIdAndDelete(req.params.id);
  await Metric.deleteMany({ userId: req.params.id } as any);
  res.json({ success: true });
});

// METRICS
app.get('/api/metrics/:userId', async (req, res) => {
  const metrics = await Metric.find({ userId: req.params.userId } as any).sort({ date: -1 });
  res.json(metrics.map(m => ({ ...m.toObject(), id: m._id })));
});

app.get('/api/all-metrics', async (req, res) => {
  const metrics = await Metric.find().sort({ date: -1 });
  res.json(metrics.map(m => ({ ...m.toObject(), id: m._id })));
});

app.post('/api/metrics', async (req, res) => {
  const { userId, actorId, actorName, ...data } = req.body;
  const metric = new Metric({ ...data, userId });
  await metric.save();
  const isSelf = userId === actorId;
  await logAudit({
    actorId, actorName, targetId: userId, type: isSelf ? AuditLogType.METRIC_UPDATE : AuditLogType.METRIC_HELP_UPDATE,
    details: `${isSelf ? 'Cập nhật' : 'Cập nhật giúp'} chỉ số ngày ${data.date}`
  });
  res.json({ ...metric.toObject(), id: metric._id });
});

app.put('/api/metrics/:id', async (req, res) => {
  const metric = await (Metric as any).findByIdAndUpdate(req.params.id, req.body, { new: true } as any);
  res.json({ ...(metric as any)?.toObject(), id: (metric as any)?._id });
});

app.delete('/api/metrics/:id', async (req, res) => {
  await (Metric as any).findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post('/api/metrics/bulk', async (req, res) => {
  const { metrics, actorId, actorName } = req.body;
  const inserted = await Metric.insertMany(metrics);
  await logAudit({ actorId, actorName, type: AuditLogType.METRIC_UPDATE, details: `Nhập hàng loạt ${metrics.length} chỉ số` });
  res.json(inserted.map(m => ({ ...m.toObject(), id: m._id })));
});

// POSTS
app.get('/api/posts', async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 });
  res.json(posts.map(p => ({ ...p.toObject(), id: p._id })));
});

app.post('/api/posts', async (req, res) => {
  const post = new Post(req.body);
  await post.save();
  await logAudit({ actorId: post.userId, actorName: post.userFullName, type: AuditLogType.POST_CREATE, details: 'Đăng bài viết mới' });
  res.json({ ...post.toObject(), id: post._id });
});

app.put('/api/posts/:id', async (req, res) => {
  const post = await (Post as any).findByIdAndUpdate(req.params.id, req.body, { new: true } as any);
  res.json({ ...(post as any)?.toObject(), id: (post as any)?._id });
});

app.delete('/api/posts/:id', async (req, res) => {
  await (Post as any).findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.put('/api/posts/:postId/react', async (req, res) => {
  const { userId, type, userName, userAvatar } = req.body;
  const post = await (Post as any).findById(req.params.postId);
  if (!post) return res.status(404).send();
  const reactions = post.reactions || [];
  const existingIdx = reactions.findIndex((r: any) => r.userId === userId);
  if (existingIdx > -1) {
    if (reactions[existingIdx].type === type) reactions.splice(existingIdx, 1);
    else reactions[existingIdx].type = type;
  } else {
    reactions.push({ userId, type, userName, userAvatar, count: 1 });
  }
  post.reactions = reactions;
  await post.save();
  res.json({ ...post.toObject(), id: post._id });
});

// CHATS & AI TRAINING
app.get('/api/chats', async (req, res) => {
  const chats = await Chat.find();
  res.json(chats.map(c => ({ ...c.toObject(), id: c.id })));
});

app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  const chat = await (Chat as any).findOneAndUpdate({ id } as any, data, { upsert: true, new: true } as any);
  res.json({ ...(chat as any).toObject(), id: (chat as any).id });
});

app.get('/api/knowledge', async (req, res) => {
  const k = await Knowledge.find();
  res.json(k.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body); await k.save();
  res.json({ ...k.toObject(), id: k._id });
});

app.delete('/api/knowledge/:id', async (req, res) => {
  await (Knowledge as any).findByIdAndDelete(req.params.id); res.json({ success: true });
});

app.get('/api/rules', async (req, res) => {
  const r = await Rule.find();
  res.json(r.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/rules', async (req, res) => {
  const r = new Rule(req.body); await r.save();
  res.json({ ...r.toObject(), id: r._id });
});

app.delete('/api/rules/:id', async (req, res) => {
  await (Rule as any).findByIdAndDelete(req.params.id); res.json({ success: true });
});

app.get('/api/audit-logs', async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
  res.json(logs.map(l => ({ ...l.toObject(), id: l._id })));
});

// GEMINI KEYS
app.get('/api/config/gemini-keys', async (req, res) => res.json(await GeminiKey.find().sort({ createdAt: -1 })));
app.post('/api/config/gemini-keys', async (req, res) => {
  const { key, name } = req.body;
  const newKey = new GeminiKey({ key, name, status: 'active' });
  await newKey.save(); res.json(newKey);
});
app.delete('/api/config/gemini-keys/:id', async (req, res) => {
  await (GeminiKey as any).findByIdAndDelete(req.params.id); res.json({ success: true });
});

// AI LOGIC
app.post('/api/ai/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const prompt = `Trích xuất các chỉ số sức khỏe từ ảnh InBody này. Trả về JSON theo mẫu: {"weight": 0, "bodyFat": 0, "muscleMass": 0, "waterPercent": 0, "boneMinerals": 0, "visceralFat": 0, "energy": 0, "bioAge": 0, "balanceIndex": 0, "date": "DD/MM"}. Nếu không thấy chỉ số nào, hãy trả về 0.`;
    const response = await callAIWithRetry('gemini-3-flash-preview', {
      parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]
    }, { responseMimeType: "application/json" });
    res.json(JSON.parse(response.text || '{}'));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.post('/api/ai/coach', async (req, res) => {
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    const response = await callAIWithRetry('gemini-3-flash-preview', 
      [{ role: 'user', parts: [{ text: systemInstruction }] }, ...history, { role: 'user', parts }]
    );
    res.json({ text: response.text });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const prompt = `Đây là ảnh chụp sổ tay ghi chép chỉ số sức khỏe hàng ngày. Hãy trích xuất danh sách tất cả các ngày có dữ liệu. Trả về mảng JSON: [{"date": "DD/MM", "weight": 0, "bodyFat": 0, "muscleMass": 0, ...}].`;
    const response = await callAIWithRetry('gemini-3-flash-preview', {
      parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]
    }, { responseMimeType: "application/json" });
    res.json(JSON.parse(response.text || '[]'));
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// --- 5. SERVER STATICS & COMPILER ---
app.use((req, res, next) => {
  // QUAN TRỌNG: Tuyệt đối không biên dịch trang chủ (/) hoặc các API (/api/)
  if (req.path === '/' || req.path.startsWith('/api/')) return next();
  
  const rootDir = path.resolve();
  let targetFile = null;
  const extensions = ['.tsx', '.ts', '.jsx', '.js'];
  for (const ext of extensions) {
    const p = path.join(rootDir, req.path.endsWith('/') ? req.path + 'index' + ext : req.path + ext);
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) { targetFile = p; break; }
    const pDirect = path.join(rootDir, req.path);
    if (fs.existsSync(pDirect) && fs.lstatSync(pDirect).isFile()) { targetFile = pDirect; break; }
  }

  if (targetFile && (targetFile.endsWith('.ts') || targetFile.endsWith('.tsx'))) {
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const result = transform(content, { transforms: ['typescript', 'jsx'], production: false, jsxRuntime: 'classic' });
      res.type('application/javascript').send(result.code); return;
    } catch (err) { return res.status(500).send(`Error compiling ${path.basename(targetFile)}`); }
  }
  next();
});

async function initDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub');
    console.log('✅ Connected to MongoDB');
    await validateGeminiKeys();
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

app.use(express.static('.') as any);

// Catch-all route cho Express 5: Phải đặt tên cho tham số (ví dụ :splat*)
app.get('/:splat*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API Not Found' });
    res.sendFile(path.resolve('index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
