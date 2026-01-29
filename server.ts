
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer'; // Cần cài đặt: npm install nodemailer
import { transform } from 'sucrase';
import { GoogleGenAI, Type } from "@google/genai";
import { UserRole, AccountStatus, HealthGoal, Permission } from './types.ts';

dotenv.config();

const app = express();

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '15mb' }) as any);

/**
 * Cấu hình Email Transporter - Sử dụng 'service: gmail' để tối ưu hóa trên Cloud
 */
const smtpConfig = {
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
};

const transporter = nodemailer.createTransport(smtpConfig);

// Kiểm tra sự tồn tại của biến môi trường ngay khi khởi động
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('⚠️ [Email] CẢNH BÁO: Thiếu biến môi trường SMTP_USER hoặc SMTP_PASS trong cấu hình Render!');
} else {
  console.log('⏳ [Email] Đang kiểm tra kết nối SMTP với service: gmail...');
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ [Email] LỖI KẾT NỐI (Render có thể đang chặn cổng SMTP):');
      console.error(error);
    } else {
      console.log('✅ [Email] Kết nối SMTP thành công. Hệ thống sẵn sàng gửi thư.');
    }
  });
}

/**
 * Mã hóa mật khẩu đơn giản bằng SHA-256
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Làm sạch phản hồi JSON từ AI (loại bỏ markdown nếu có)
 */
const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

// Middleware bảo mật: Chặn truy cập trực tiếp vào các file nhạy cảm
app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.ts', 'run.js', 'package.json', 'package-lock.json', 'tsconfig.json'];
  const url = req.path.toLowerCase();
  
  const isForbidden = forbiddenFiles.some(file => url.endsWith(file)) || url.includes('/.');
  
  if (isForbidden) {
    console.warn(`[Security] Chặn truy cập trái phép tới: ${req.path}`);
    return res.status(403).json({ message: 'Access Denied: You do not have permission to access this resource.' });
  }
  next();
});

// Middleware biên dịch TypeScript/JSX on-the-fly
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const rootDir = path.resolve();
  let filePath = path.join(rootDir, req.path);
  let targetFile = null;
  if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
    targetFile = filePath;
  } else if (fs.existsSync(filePath + '.ts')) {
    targetFile = filePath + '.ts';
  } else if (fs.existsSync(filePath + '.tsx')) {
    targetFile = filePath + '.tsx';
  }
  if (targetFile && (targetFile.endsWith('.ts') || targetFile.endsWith('.tsx'))) {
    try {
      const content = fs.readFileSync(targetFile, 'utf-8');
      const result = transform(content, {
        transforms: ['typescript', 'jsx'],
        production: false,
        jsxRuntime: 'automatic'
      });
      res.type('application/javascript').send(result.code);
      return;
    } catch (err) {
      return res.status(500).send('Error compiling file');
    }
  }
  next();
});

// QUẢN LÝ CẤU HÌNH API KEYS & DATABASE
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

const API_KEYS = [
  process.env.API_KEY, 
  process.env.API_KEY_2, 
  process.env.API_KEY_3
].filter(k => !!k);

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
  } catch (err: any) { 
    console.error('❌ [Database] KHÔNG THỂ KẾT NỐI DATABASE:', err.message);
  }
}
initDB();

let currentKeyIndex = 0;

async function callAiWithFallback(callFn: (ai: GoogleGenAI) => Promise<any>) {
  let lastError = null;
  const numKeys = API_KEYS.length;
  if (numKeys === 0) throw new Error("Không tìm thấy API Key nào");
  const startIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % numKeys;
  for (let attempt = 0; attempt < numKeys; attempt++) {
    const index = (startIndex + attempt) % numKeys;
    const key = API_KEYS[index];
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      return await callFn(ai);
    } catch (err: any) {
      lastError = err;
      const isQuotaError = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
      if (isQuotaError && attempt < numKeys - 1) continue;
      break; 
    }
  }
  throw lastError;
}

// --- CÁC ROUTE API ---

app.get('/api/health', (req, res) => {
  const states: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({ status: 'ok', database: states[mongoose.connection.readyState] || 'unknown' });
});

// ROUTE KIỂM TRA EMAIL TRÙNG
app.post('/api/check-email', async (req, res) => {
  try {
    const { email, excludeUserId } = req.body;
    const query: any = { email: email.toLowerCase().trim() };
    if (excludeUserId) query._id = { $ne: excludeUserId };
    
    const exists = await User.findOne(query);
    res.json({ exists: !!exists });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi kiểm tra email' });
  }
});

// ROUTE QUÊN MẬT KHẨU (GỬI EMAIL THẬT)
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    console.log(`[Email Service] Đang tìm kiếm người dùng: ${username}`);
    const user = await User.findOne({ 
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() }
      ]
    });
    
    if (!user) {
      console.warn(`[Email Service] Yêu cầu reset mật khẩu cho tài khoản không tồn tại: ${username}`);
      return res.status(404).json({ message: 'Không tìm thấy tài khoản hoặc email này trong hệ thống.' });
    }

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); 
    await user.save();

    console.log(`[Email Service] Đang tiến hành gửi mail tới: ${user.email}`);

    const mailOptions = {
      from: `"Lucky Hub 2026" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Mã xác nhận khôi phục mật khẩu - Lucky Hub',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
          <h2 style="color: #10b981;">Xin chào ${user.fullName},</h2>
          <p>Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản <strong>${user.username}</strong> của bạn.</p>
          <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: bold;">Mã xác nhận của bạn là:</p>
            <h1 style="margin: 10px 0; font-size: 32px; letter-spacing: 5px; color: #0f172a;">${token}</h1>
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">Mã này sẽ hết hạn sau 1 giờ.</p>
          </div>
          <p>Nếu bạn không yêu cầu thay đổi mật khẩu, vui lòng bỏ qua email này hoặc liên hệ hỗ trợ nếu thấy có dấu hiệu bất thường.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">🍀 Lucky Hub 2026 - Chuyên gia sức khỏe của bạn</p>
        </div>
      `
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ [Email Service] Gửi thành công tới ${user.email}. MessageId: ${info.messageId}`);
      res.json({ message: 'Mã xác nhận đã được gửi thành công tới email của bạn.' });
    } catch (mailError: any) {
      console.error('❌ [Email Service] Gửi mail thất bại (LỖI KẾT NỐI):');
      console.error('Chi tiết lỗi:', mailError.code, '-', mailError.message);
      
      // Thông báo cụ thể hơn cho người dùng dựa trên lỗi
      let userFriendlyMsg = 'Lỗi dịch vụ email (ETIMEDOUT). Render có thể đang chặn cổng SMTP của bạn.';
      if (mailError.code === 'EAUTH') {
        userFriendlyMsg = 'Lỗi xác thực (EAUTH). Vui lòng kiểm tra lại SMTP_USER và SMTP_PASS (Mật khẩu ứng dụng).';
      }

      res.status(500).json({ 
        message: userFriendlyMsg,
        error: process.env.NODE_ENV !== 'production' ? mailError.message : undefined
      });
    }
  } catch (err: any) {
    console.error('❌ [Email Service] Lỗi hệ thống server:', err);
    res.status(500).json({ message: 'Lỗi server khi xử lý yêu cầu.' });
  }
});

// ROUTE RESET MẬT KHẨU
app.post('/api/reset-password', async (req, res) => {
  try {
    const { username, token, newPassword } = req.body;
    const user = await User.findOne({ 
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() }
      ],
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Mã xác nhận không chính xác hoặc đã hết hạn.' });
    }

    user.password = hashPassword(newPassword);
    user.isPasswordEncrypted = true;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Mật khẩu đã được thay đổi thành công. Vui lòng đăng nhập lại.' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server khi đặt lại mật khẩu.' });
  }
});

/** AI Extract & Coach Route (Giữ nguyên logic cũ) **/
app.post('/api/ai/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: "Hãy trích xuất các chỉ số từ phiếu InBody này và trả về JSON có các trường: weight, bodyFat, muscleMass, balanceIndex, visceralFat, boneMinerals, waterPercent, energy, bioAge, date (format DD/MM). Nếu không thấy trường nào hãy để mặc định phù hợp hoặc 0." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      return response.text;
    });
    res.json(JSON.parse(cleanJsonResponse(resultText || "{}")));
  } catch (err) { res.status(500).json({ message: 'Lỗi AI trích xuất' }); }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: "Trích xuất danh sách kết quả đo lường từ hình ảnh này. Trả về mảng JSON các đối tượng có trường: weight, bodyFat, muscleMass, balanceIndex, visceralFat, boneMinerals, waterPercent, energy, bioAge, date (DD/MM)." }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });
      return response.text;
    });
    res.json(JSON.parse(cleanJsonResponse(resultText || "[]")));
  } catch (err) { res.status(500).json({ message: 'Lỗi AI trích xuất hàng loạt' }); }
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
    res.json({ text: resultText || "Xin lỗi, tôi đang bận một chút." });
  } catch (err) { res.status(500).json({ text: 'AI bận, vui lòng thử lại sau.' }); }
});

// AUTH & USERS
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, fullName, ...rest } = req.body;
    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ message: 'Tên tài khoản đã tồn tại' });
    
    const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ message: 'Email này đã được đăng ký' });

    const newUser = new User({
      ...rest,
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      password: hashPassword(password),
      isPasswordEncrypted: true,
      fullName
    });
    await newUser.save();
    res.json({ message: 'Đăng ký thành công' });
  } catch (err) { res.status(500).json({ message: 'Lỗi đăng ký' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ 
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() }
      ]
    });
    if (!user) return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });

    const hashed = hashPassword(password);
    if (user.password !== hashed) {
      if (!user.isPasswordEncrypted && user.password === password) {
        return res.status(426).json({ message: 'Yêu cầu nâng cấp mật khẩu', userId: user._id, fullName: user.fullName });
      }
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' });
    }

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
    const { email } = req.body;
    if (email) {
      const existing = await User.findOne({ 
        email: email.toLowerCase().trim(), 
        _id: { $ne: req.params.id } 
      });
      if (existing) return res.status(400).json({ message: 'Email đã tồn tại' });
    }
    const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (u) res.json({ ...u.toObject(), id: u._id });
    else res.status(404).json({ message: 'Không tìm thấy' });
  } catch (err) { res.status(500).json({ message: 'Lỗi cập nhật người dùng' }); }
});

app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// METRICS
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

// KNOWLEDGE, RULES, CHATS, POSTS
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

// --- PHỤC VỤ TỆP TĨNH ---
app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => { res.sendFile(path.resolve('index.html')); });

app.listen(PORT, () => { console.log(`🚀 [Server] Đang chạy tại http://localhost:${PORT}`); });
