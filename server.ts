
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
app.use(express.json({ limit: '15mb' }) as any);

/**
 * CẤU HÌNH DỊCH VỤ EMAIL QUA MAILEROO API V2
 */
const MAILEROO_CONFIG = {
  apiKey: process.env.MAILEROO_API_KEY,
  endpoint: 'https://smtp.maileroo.com/api/v2/emails', 
  fromEmail: process.env.SMTP_USER, 
  fromName: "Lucky Hub 2026"
};

if (!MAILEROO_CONFIG.apiKey) {
  console.error('⚠️ [Email] LỖI: Thiếu MAILEROO_API_KEY trong biến môi trường!');
} else {
  console.log('✅ [Email] Hệ thống Maileroo API v2 sử dụng Endpoint: ' + MAILEROO_CONFIG.endpoint);
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
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Lỗi Maileroo');
    return result;
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

// QUẢN LÝ 3 API KEYS GEMINI
const API_KEYS = [
  process.env.API_KEY, 
  process.env.API_KEY_2, 
  process.env.API_KEY_3
].filter(k => !!k);

console.log(`📡 [AI Service] Khởi tạo thành công với ${API_KEYS.length} Keys: [${API_KEYS.map((_, i) => `Key#${i+1}`).join(', ')}]`);

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

const metricSchema = new mongoose.Schema({
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
}, { timestamps: true });

metricSchema.index({ userId: 1, date: 1 }, { unique: true });
const Metric = mongoose.model('Metric', metricSchema);

const Post = mongoose.model('Post', new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrl: String,
  timestamp: String
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
    console.log('⏳ [Database] Đang kết nối tới MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ [Database] Đã kết nối thành công.');
  } catch (err: any) { console.error('❌ [Database] Lỗi:', err.message); }
}
initDB();

// BIẾN TOÀN CỤC ĐỂ THEO DÕI THỨ TỰ KEY
let currentKeyIndex = 0;

/**
 * Hàm gọi AI với cơ chế Luân phiên (Round-robin) 3 Key
 * Đảm bảo sử dụng tất cả các Key được cấu hình trong .env
 */
async function callAiWithFallback(callFn: (ai: GoogleGenAI) => Promise<any>) {
  const numKeys = API_KEYS.length;
  if (numKeys === 0) throw new Error("Không tìm thấy API Key Gemini nào trong cấu hình.");

  let lastError = null;
  
  // Xác định Key bắt đầu cho yêu cầu này (luân phiên)
  const startIndex = currentKeyIndex;
  // Cập nhật chỉ số cho yêu cầu tiếp theo ngay lập tức
  currentKeyIndex = (currentKeyIndex + 1) % numKeys;

  for (let attempt = 0; attempt < numKeys; attempt++) {
    const index = (startIndex + attempt) % numKeys;
    const key = API_KEYS[index];
    const maskedKey = `${key.substring(0, 8)}...`;

    try {
      console.log(`🤖 [AI Service] [Yêu cầu mới] Thử Key #${index + 1} (${maskedKey}) - Lần thử ${attempt + 1}/${numKeys}`);
      
      const ai = new GoogleGenAI({ apiKey: key });
      const result = await callFn(ai);
      
      console.log(`✅ [AI Service] Key #${index + 1} phản hồi thành công.`);
      return result;
    } catch (err: any) {
      lastError = err;
      const errorDetail = err.message || "Lỗi không rõ nguyên nhân";
      console.error(`⚠️ [AI Service] Key #${index + 1} thất bại: ${errorDetail.substring(0, 100)}`);
      
      // Nếu còn Key khác, tiếp tục thử Key tiếp theo
      if (attempt < numKeys - 1) {
        console.log(`🔄 [AI Service] Đang tự động chuyển sang Key dự phòng kế tiếp...`);
        continue;
      }
    }
  }
  
  console.error(`❌ [AI Service] TẤT CẢ ${numKeys} KEYS ĐỀU THẤT BẠI.`);
  throw lastError;
}

// --- CÁC ROUTE API ---

app.get('/api/health', (req, res) => {
  const states: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ status: 'ok', database: states[mongoose.connection.readyState] || 'unknown' });
});

app.post('/api/check-email', async (req, res) => {
  try {
    const { email, excludeUserId } = req.body;
    const query: any = { email: email.toLowerCase().trim() };
    if (excludeUserId) query._id = { $ne: excludeUserId };
    const exists = await User.findOne(query);
    res.json({ exists: !!exists });
  } catch (err) { res.status(500).json({ message: 'Lỗi kiểm tra email' }); }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); 
    await user.save();

    const subject = 'Mã xác nhận khôi phục mật khẩu - Lucky Hub';
    const html = `<div style="font-family: sans-serif; padding: 20px;"><h2>Xin chào ${user.fullName},</h2><p>Mã xác nhận của bạn là:</p><h1 style="color: #10b981;">${token}</h1><p>Mã hết hạn sau 1 giờ.</p></div>`;

    await sendMailViaMaileroo(user.email, subject, html);
    res.json({ message: 'Mã xác nhận đã được gửi thành công.' });
  } catch (err: any) { res.status(500).json({ message: 'Lỗi gửi mail.' }); }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, token, newPassword } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }], resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Mã không chính xác hoặc hết hạn.' });
    user.password = hashPassword(newPassword);
    user.isPasswordEncrypted = true;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: 'Đổi mật khẩu thành công.' });
  } catch (err) { res.status(500).json({ message: 'Lỗi server.' }); }
});

app.post('/api/ai/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, { text: "Trích xuất chỉ số InBody sang JSON: weight, bodyFat, muscleMass, balanceIndex, visceralFat, boneMinerals, waterPercent, energy, bioAge, date (DD/MM)." }] }],
        config: { responseMimeType: "application/json" }
      });
      return response.text;
    });
    res.json(JSON.parse(cleanJsonResponse(resultText || "{}")));
  } catch (err) { res.status(500).json({ message: 'AI bận, vui lòng thử lại sau.' }); }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, { text: "Trích xuất mảng JSON các kết quả đo: weight, bodyFat, muscleMass, balanceIndex, visceralFat, boneMinerals, waterPercent, energy, bioAge, date (DD/MM)." }] }],
        config: { responseMimeType: "application/json" }
      });
      return response.text;
    });
    res.json(JSON.parse(cleanJsonResponse(resultText || "[]")));
  } catch (err) { res.status(500).json({ message: 'AI bận, vui lòng thử lại sau.' }); }
});

app.post('/api/ai/coach', async (req, res) => {
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const parts: any[] = [{ text: latestUserMessage }];
      if (imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
      const contents = [...history, { role: 'user', parts }];
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: { systemInstruction }
      });
      return response.text;
    });
    res.json({ text: resultText || "Xin lỗi, tôi đang bận." });
  } catch (err) { res.status(500).json({ text: 'AI bận, vui lòng thử lại sau.' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, fullName, ...rest } = req.body;
    const existing = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: email.toLowerCase().trim() }] });
    if (existing) return res.status(400).json({ message: 'Tài khoản hoặc email đã tồn tại' });
    const newUser = new User({ ...rest, username: username.toLowerCase().trim(), email: email.toLowerCase().trim(), password: hashPassword(password), isPasswordEncrypted: true, fullName });
    await newUser.save();
    res.json({ message: 'Đăng ký thành công' });
  } catch (err) { res.status(500).json({ message: 'Lỗi đăng ký' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user) return res.status(401).json({ message: 'Sai thông tin' });
    const hashed = hashPassword(password);
    if (user.password !== hashed) return res.status(401).json({ message: 'Sai thông tin' });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ...u?.toObject(), id: u?._id });
  } catch (err) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
});

app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/all-metrics', async (req, res) => {
  const m = await Metric.find().sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
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

app.put('/api/metrics/:id', async (req, res) => {
  const m = await Metric.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ ...m?.toObject(), id: m?._id });
});

app.delete('/api/metrics/:id', async (req, res) => {
  await Metric.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post('/api/metrics/bulk', async (req, res) => {
  const results = [];
  for (const item of req.body) {
    const u = await Metric.findOneAndUpdate({ userId: item.userId, date: item.date }, item, { upsert: true, new: true });
    results.push(u);
  }
  res.json(results);
});

app.post('/api/metrics/delete-bulk', async (req, res) => {
  await Metric.deleteMany({ _id: { $in: req.body.ids } });
  res.json({ success: true });
});

app.delete('/api/metrics/all/:userId', async (req, res) => {
  await Metric.deleteMany({ userId: req.params.userId });
  res.json({ success: true });
});

app.get('/api/knowledge', async (req, res) => {
  const k = await Knowledge.find();
  res.json(k.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body);
  await k.save();
  res.json({ ...k.toObject(), id: k._id });
});

app.delete('/api/knowledge/:id', async (req, res) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/rules', async (req, res) => {
  const r = await Rule.find();
  res.json(r.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/rules', async (req, res) => {
  const r = new Rule(req.body);
  await r.save();
  res.json({ ...r.toObject(), id: r._id });
});

app.delete('/api/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/chats', async (req, res) => {
  const c = await Chat.find();
  res.json(c);
});

app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  const c = await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true });
  res.json(c);
});

app.get('/api/posts', async (req, res) => {
  const p = await Post.find().sort({ createdAt: -1 });
  res.json(p.map(i => ({ ...i.toObject(), id: i._id })));
});

app.post('/api/posts', async (req, res) => {
  const p = new Post(req.body);
  await p.save();
  res.json({ ...p.toObject(), id: p._id });
});

app.delete('/api/posts/:id', async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => { res.sendFile(path.resolve('index.html')); });

app.listen(PORT, () => { console.log(`🚀 [Server] Đang chạy tại http://localhost:${PORT}`); });
