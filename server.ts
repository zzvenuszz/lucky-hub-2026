
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

// QUẢN LÝ CẤU HÌNH API KEYS & DATABASE
const PORT = process.env.PORT || 3000;
// THỐNG NHẤT BIẾN MÔI TRƯỜNG MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

const API_KEYS = [
  process.env.API_KEY, 
  process.env.API_KEY_2, 
  process.env.API_KEY_3
].filter(k => !!k);

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
    console.log('⏳ Đang kết nối Database...');
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ CẢNH BÁO: Biến MONGODB_URI không tồn tại trong .env, đang sử dụng mặc định localhost.');
    }
    const maskedUri = MONGODB_URI.replace(/:([^@]+)@/, ':****@');
    console.log(`🔗 URI mục tiêu: ${maskedUri}`);

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, 
    });
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY');
  } catch (err: any) { 
    console.error('❌ DATABASE CONNECTION ERROR:');
    console.error(`- Error: ${err.message}`);
    console.error(`- Kiểm tra: .env có MONGODB_URI chưa? Atlas đã mở IP 0.0.0.0/0 chưa?`);
  }
}
initDB();

/**
 * BIẾN TOÀN CỤC ĐỂ THEO DÕI KEY ĐANG SỬ DỤNG (ROUND-ROBIN)
 */
let currentKeyIndex = 0;

/**
 * HÀM WRAPPER ĐỂ XỬ LÝ LUÂN PHIÊN VÀ DỰ PHÒNG API KEY
 */
async function callAiWithFallback(callFn: (ai: GoogleGenAI) => Promise<any>) {
  let lastError = null;
  const numKeys = API_KEYS.length;
  
  if (numKeys === 0) {
    throw new Error("Không tìm thấy API Key nào trong cấu hình hệ thống (.env)");
  }
  
  const startIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % numKeys;
  
  for (let attempt = 0; attempt < numKeys; attempt++) {
    const index = (startIndex + attempt) % numKeys;
    const key = API_KEYS[index];
    
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      console.log(`📡 [AI Request] Xoay vòng lượt: Key index ${index} (Key ${index + 1}/${numKeys})`);
      return await callFn(ai);
    } catch (err: any) {
      lastError = err;
      const isQuotaError = err.message?.includes('429') || err.message?.toLowerCase().includes('quota');
      const isNetworkError = err.message?.includes('fetch') || err.message?.includes('socket');
      
      if ((isQuotaError || isNetworkError) && attempt < numKeys - 1) {
        console.warn(`⚠️ API Key index ${index} gặp lỗi (Hết quota/Kết nối), đang thử Key dự phòng tiếp theo...`);
        continue;
      }
      break; 
    }
  }
  throw lastError;
}

// API AI PROXY
app.post('/api/ai/extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: 'Thiếu hình ảnh' });

    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
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
      return response.text;
    });

    res.json(JSON.parse(cleanJsonResponse(resultText || "{}")));
  } catch (err) {
    console.error("AI EXTRACT ERROR:", err);
    res.status(500).json({ message: 'Lỗi AI Server (Tất cả Key đều quá tải hoặc lỗi mạng)' });
  }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
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
      return response.text;
    });
    
    res.json(JSON.parse(cleanJsonResponse(resultText || "[]")));
  } catch (err) {
    console.error("AI BULK ERROR:", err);
    res.status(500).json({ message: 'Lỗi quét hàng loạt (Tất cả Key đều quá tải)' });
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

    const resultText = await callAiWithFallback(async (ai) => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: { systemInstruction, temperature: 0.7 }
      });
      return response.text;
    });

    res.json({ text: resultText });
  } catch (err) {
    console.error("AI COACH ERROR:", err);
    res.status(500).json({ text: 'Hệ thống đang bận xử lý nhiều yêu cầu (Tất cả Key đều quá tải), vui lòng thử lại sau.' });
  }
});

// API AUTH
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Thiếu thông tin đăng nhập' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    
    if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
    
    if (user.isPasswordEncrypted) {
      if (user.password !== hashPassword(password)) return res.status(401).json({ message: 'Mật khẩu sai' });
      res.json(user);
    } else {
      if (user.password !== password) return res.status(401).json({ message: 'Mật khẩu sai' });
      res.status(426).json({ userId: user._id, fullName: user.fullName });
    }
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: 'Lỗi server khi đăng nhập' });
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
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: 'Lỗi server khi đăng ký' });
  }
});

// API USERS, POSTS, METRICS... (Giữ nguyên phần còn lại)
app.get('/api/posts', async (req, res) => res.json(await Post.find().sort({ createdAt: -1 })));
app.post('/api/posts', async (req, res) => res.json(await new Post(req.body).save()));
app.delete('/api/posts/:id', async (req, res) => { await Post.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.put('/api/users/:id', async (req, res) => {
  const data = { ...req.body };
  if (data.password && data.isPasswordEncrypted) data.password = hashPassword(data.password);
  res.json(await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password'));
});
app.delete('/api/users/:id', async (req, res) => { await User.findByIdAndDelete(req.params.id); res.json({ message: 'User Deleted' }); });
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

app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/knowledge', async (req, res) => res.json(await new Knowledge(req.body).save()));
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.get('/api/rules', async (req, res) => res.json(await Rule.find()));
app.post('/api/rules', async (req, res) => res.json(await new Rule(req.body).save()));
app.delete('/api/rules/:id', async (req, res) => { await Rule.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => res.json(await Chat.findOneAndUpdate({ id: req.body.id }, req.body, { upsert: true, new: true })));

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));

app.listen(PORT, () => {
  console.log(`🚀 Lucky Hub is running on port ${PORT}`);
  console.log(`📡 AI Keys Configured: ${API_KEYS.length} keys (Round-robin Active)`);
  console.log(`🗄️ MongoDB URI: Thống nhất sử dụng MONGODB_URI`);
});
