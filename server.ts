
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
app.use(express.json({ limit: '15mb' }) as any); // Tăng limit để xử lý ảnh base64

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

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

app.use(express.static('.') as any);

const PORT = process.env.PORT || 3000;
// Ưu tiên sử dụng MONGO_URI từ render.com
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
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

const postSchema = new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrl: String,
  timestamp: String
}, { timestamps: true });
const Post = mongoose.model('Post', postSchema);

const chatSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  coachId: { type: String, required: true },
  messages: [{ id: String, senderId: String, senderName: String, senderRole: String, content: String, timestamp: String, imageUrl: String }]
}, { timestamps: true });
const Chat = mongoose.model('Chat', chatSchema);

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));
const Rule = mongoose.model('Rule', new mongoose.Schema({ content: String }));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DATABASE CONNECTED');
  } catch (err) { console.error('❌ DB ERROR:', err); }
}
initDB();

// INITIALIZE GEMINI ON SERVER
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// API AI PROXY
app.post('/api/ai/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: 'Thiếu hình ảnh' });

    const model = genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: `Bạn là chuyên gia phân tích phiếu InBody. Hãy trích xuất: weight, bodyFat, muscleMass, visceralFat, boneMinerals, waterPercent, energy, bioAge, balanceIndex. Trả về JSON với các trường này. Nếu không thấy, trả về 0 cho trường đó. Ngày (date) trả về định dạng DD/MM.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            weight: { type: Type.NUMBER },
            bodyFat: { type: Type.NUMBER },
            boneMinerals: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER },
            muscleMass: { type: Type.NUMBER },
            balanceIndex: { type: Type.NUMBER },
            energy: { type: Type.NUMBER },
            bioAge: { type: Type.NUMBER },
            visceralFat: { type: Type.NUMBER }
          }
        }
      }
    });

    const result = await model;
    res.json(JSON.parse(cleanJsonResponse(result.text || "{}")));
  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ message: 'Lỗi AI Server' });
  }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const response = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { 
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }, 
          { text: `Đọc bảng kết quả sức khỏe. Trích xuất mảng JSON ĐẦY ĐỦ 9 CHỈ SỐ. Trường date chỉ trả về Ngày và Tháng định dạng "DD/MM". NẾU KHÔNG CÓ DỮ LIỆU HỢP LỆ, TRẢ VỀ MẢNG RỖNG [].` }
        ] 
      },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              bodyFat: { type: Type.NUMBER },
              muscleMass: { type: Type.NUMBER },
              visceralFat: { type: Type.NUMBER },
              boneMinerals: { type: Type.NUMBER },
              waterPercent: { type: Type.NUMBER },
              energy: { type: Type.NUMBER },
              bioAge: { type: Type.NUMBER },
              balanceIndex: { type: Type.NUMBER }
            },
            required: ["weight"]
          }
        }
      }
    });
    res.json(JSON.parse(cleanJsonResponse(response.text || "[]")));
  } catch (err) {
    res.status(500).json({ message: 'Lỗi quét hàng loạt' });
  }
});

app.post('/api/ai/coach', async (req, res) => {
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    
    const contents: any[] = history.map((m: any) => ({
      role: m.role,
      parts: [{ text: m.parts[0].text }]
    }));

    const userParts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) {
      userParts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    }

    contents.push({ role: 'user', parts: userParts });

    const response = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: { systemInstruction, temperature: 0.7 }
    });

    res.json({ text: response.text });
  } catch (err) {
    res.status(500).json({ text: 'Tôi đang bận một chút, hãy thử lại sau.' });
  }
});

// API AUTH
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username: username.toLowerCase().trim() });
  if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
  if (user.isPasswordEncrypted) {
    if (user.password !== hashPassword(password)) return res.status(401).json({ message: 'Mật khẩu sai' });
    res.json(user);
  } else {
    if (user.password !== password) return res.status(401).json({ message: 'Mật khẩu sai' });
    res.status(426).json({ userId: user._id, fullName: user.fullName });
  }
});

// API REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, fullName, phoneNumber, birthDate, height, weight, gender, healthGoal } = req.body;
    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ message: 'Tên đăng nhập đã được sử dụng' });

    const newUser = new User({
      username: username.toLowerCase().trim(),
      password: hashPassword(password),
      fullName, phoneNumber, birthDate, height, weight, gender, healthGoal,
      role: UserRole.MEMBER, status: AccountStatus.ACTIVE, isPasswordEncrypted: true
    });
    await newUser.save();
    res.status(201).json({ message: 'Đăng ký thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server khi đăng ký' });
  }
});

// API POSTS
app.get('/api/posts', async (req, res) => res.json(await Post.find().sort({ createdAt: -1 })));
app.post('/api/posts', async (req, res) => res.json(await new Post(req.body).save()));
app.delete('/api/posts/:id', async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });

// API USERS
app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.put('/api/users/:id', async (req, res) => {
  const data = { ...req.body };
  if (data.password && data.isPasswordEncrypted) data.password = hashPassword(data.password);
  res.json(await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password'));
});
app.delete('/api/users/:id', async (req, res) => { await User.findByIdAndDelete(req.params.id); res.json({ message: 'User Deleted' }); });

// API METRICS
app.get('/api/metrics/:userId', async (req, res) => res.json(await Metric.find({ userId: req.params.userId }).sort({ date: 1 })));
app.get('/api/all-metrics', async (req, res) => res.json(await Metric.find().populate('userId', 'fullName')));
app.post('/api/metrics', async (req, res) => res.json(await new Metric(req.body).save()));
app.put('/api/metrics/:id', async (req, res) => res.json(await Metric.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/metrics/:id', async (req, res) => { 
  await Metric.findByIdAndDelete(req.params.id); 
  res.json({ message: 'Metric Deleted' }); 
});
app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const results = await Metric.insertMany(req.body);
    res.json(results);
  } catch (err) {
    res.status(400).json({ message: 'Lỗi lưu dữ liệu hàng loạt', error: err });
  }
});
app.post('/api/metrics/delete-bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    await Metric.deleteMany({ _id: { $in: ids } });
    res.json({ message: 'Bulk Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi xóa hàng loạt' });
  }
});
app.delete('/api/metrics/all/:userId', async (req, res) => {
  try {
    await Metric.deleteMany({ userId: req.params.userId });
    res.json({ message: 'All Metrics Cleared' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi xóa trắng' });
  }
});

// OTHER API
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/knowledge', async (req, res) => res.json(await new Knowledge(req.body).save()));
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.get('/api/rules', async (req, res) => res.json(await Rule.find()));
app.post('/api/rules', async (req, res) => res.json(await new Rule(req.body).save()));
app.delete('/api/rules/:id', async (req, res) => { await Rule.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => res.json(await Chat.findOneAndUpdate({ id: req.body.id }, req.body, { upsert: true, new: true })));

app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
app.listen(PORT, () => console.log(`🚀 Lucky Hub tại ${PORT}`));
