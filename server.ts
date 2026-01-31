
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
app.use(express.json({ limit: '50mb' }) as any);

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);
const healthyKeys: string[] = [];
const keyCooldowns = new Map<string, number>(); // Lưu thời điểm key hết hạn cooldown

/**
 * KIỂM TRA TRẠNG THÁI GEMINI API KEYS KHI KHỞI ĐỘNG
 */
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

/**
 * HÀM ĐIỀU PHỐI AI THÔNG MINH (Retry + Cooldown)
 */
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
    
    // Lọc các key đang không bị cooldown
    const availableKeys = API_KEYS.filter(k => {
      const cooldownUntil = keyCooldowns.get(k) || 0;
      return now > cooldownUntil;
    });

    if (availableKeys.length === 0) {
      console.error(`[${requestId}] 🚨 TẤT CẢ KEYS ĐANG TRONG THỜI GIAN CHỜ (COOLDOWN)!`);
      throw new Error("Tất cả API Keys hiện đang quá tải hoặc hết hạn mức. Vui lòng thử lại sau 30 giây.");
    }

    const selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    const keyIdx = API_KEYS.indexOf(selectedKey) + 1;

    console.log(`[${requestId}] 📡 Thử lần ${attempt}/${retries} | Sử dụng Key #${keyIdx}`);

    try {
      const ai = new GoogleGenAI({ apiKey: selectedKey });
      const response = await ai.models.generateContent({
        model: modelName,
        ...payload
      });
      return response;
    } catch (err: any) {
      const isOverloaded = err.message?.includes('503') || err.message?.includes('overloaded');
      const isRateLimited = err.message?.includes('429') || err.message?.includes('quota');

      if (isOverloaded || isRateLimited) {
        const cooldownTime = 30000; // Nghỉ 30 giây
        keyCooldowns.set(selectedKey, now + cooldownTime);
        console.warn(`[${requestId}] ⚠️ Key #${keyIdx} gặp lỗi ${isOverloaded ? '503' : '429'}. Tạm dừng 30s.`);
        
        if (attempt < retries) {
          console.log(`[${requestId}] 🔄 Đang bốc Key khác để thử lại...`);
          continue; 
        }
      }
      throw err; // Nếu lỗi khác hoặc hết lượt retry
    }
  }
}

/**
 * API TRÍCH XUẤT CHỈ SỐ INBODY ĐƠN LẺ
 */
app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  console.log(`[${requestId}] 📸 [OCR] Nhận yêu cầu trích xuất từ ảnh...`);
  
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const payload = {
      contents: [{
        parts: [
          { text: "Phân tích ảnh kết quả đo chỉ số InBody hoặc cân điện tử này. Trích xuất chính xác các số liệu. Nếu không thấy số liệu, hãy để là 0. Trả về JSON." },
          { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weight: { type: Type.NUMBER },
            bodyFat: { type: Type.NUMBER },
            muscleMass: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER },
            boneMinerals: { type: Type.NUMBER },
            visceralFat: { type: Type.NUMBER },
            energy: { type: Type.NUMBER },
            bioAge: { type: Type.NUMBER },
            balanceIndex: { type: Type.NUMBER },
            date: { type: Type.STRING, description: "Ngày đo dạng DD/MM" }
          }
        }
      }
    };

    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    console.log(`[${requestId}] ✅ [OCR] Trích xuất thành công.`);
    res.json(JSON.parse(response.text));
  } catch (err: any) {
    console.error(`[${requestId}] ❌ [OCR] Lỗi:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * API TRÍCH XUẤT CHỈ SỐ HÀNG LOẠT (BỔ SUNG)
 */
app.post('/api/ai/bulk-extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  console.log(`[${requestId}] 📚 [Bulk OCR] Nhận yêu cầu quét hàng loạt...`);
  
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const payload = {
      contents: [{
        parts: [
          { text: "Đây là ảnh chụp danh sách nhiều ngày đo lường sức khỏe (InBody/Sổ tay). Hãy trích xuất tất cả các dòng dữ liệu tìm thấy dưới dạng một mảng JSON các đối tượng." },
          { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING, description: "Ngày đo dạng DD/MM" },
              weight: { type: Type.NUMBER },
              bodyFat: { type: Type.NUMBER },
              muscleMass: { type: Type.NUMBER },
              waterPercent: { type: Type.NUMBER },
              boneMinerals: { type: Type.NUMBER },
              visceralFat: { type: Type.NUMBER },
              energy: { type: Type.NUMBER },
              bioAge: { type: Type.NUMBER },
              balanceIndex: { type: Type.NUMBER }
            }
          }
        }
      }
    };

    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    console.log(`[${requestId}] ✅ [Bulk OCR] Trích xuất thành công ${JSON.parse(response.text).length} bản ghi.`);
    res.json(JSON.parse(response.text));
  } catch (err: any) {
    console.error(`[${requestId}] ❌ [Bulk OCR] Lỗi:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * API TƯ VẤN COACH
 */
app.post('/api/ai/coach', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  console.log(`[${requestId}] 🤖 [Coach] Nhận yêu cầu tư vấn...`);
  
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) {
      parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    }

    const payload = {
      contents: [
        ...history,
        { role: 'user', parts }
      ],
      config: { systemInstruction }
    };

    const response = await callAIWithRetry(requestId, 'gemini-3-flash-preview', payload);
    console.log(`[${requestId}] ✅ [Coach] Phản hồi thành công.`);
    res.json({ text: response.text });
  } catch (err: any) {
    console.error(`[${requestId}] ❌ [Coach] Lỗi:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * HÀM TIỆN ÍCH UPLOAD ẢNH LÊN IMGBB
 * PHÂN TÍCH: Sử dụng URLSearchParams thay cho FormData để tránh lỗi typing 'Blob' 
 * và đảm bảo tương thích tốt hơn với fetch của Node.js khi gửi dữ liệu base64.
 */
async function uploadToImgBB(base64Data: string | undefined): Promise<{url: string, deleteUrl: string} | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
      console.error('❌ [ImgBB] Missing API Key in Environment');
      return null;
    }
    const base64Image = base64Data.split(',')[1];
    if (!base64Image) return null;
    
    // Sử dụng URLSearchParams thay vì FormData để gửi dữ liệu dạng form-urlencoded
    const params = new URLSearchParams();
    params.append('image', base64Image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [ImgBB] Upload failed with status ${response.status}:`, errorText.substring(0, 200));
      return null;
    }

    const result = await response.json();
    if (result.success) return { url: result.data.url, deleteUrl: result.data.delete_url };
    
    console.error('❌ [ImgBB] API returned success false:', result);
    return null;
  } catch (error: any) {
    console.error('❌ [ImgBB] Fatal Error:', error.message);
    return null;
  }
}

/**
 * HÀM THỰC THI XÓA ẢNH TRÊN CDN
 * PHÂN TÍCH: Sử dụng URLSearchParams để gửi yêu cầu xóa ảnh tới ibb.co (JSON endpoint).
 */
async function purgeImageFromCDN(deleteUrl: string, retries = 3): Promise<boolean> {
  if (!deleteUrl || !deleteUrl.includes('ibb.co')) return false;
  try {
    const urlParts = deleteUrl.split('/').filter(p => p.length > 0);
    const imageHash = urlParts.pop();
    const imageId = urlParts.pop();
    if (!imageId || !imageHash) return false;

    // Sử dụng URLSearchParams thay cho FormData để tránh lỗi 'Blob' typing trong Node.js
    const params = new URLSearchParams();
    params.append('pathname', `/${imageId}/${imageHash}`);
    params.append('action', 'delete');
    params.append('delete', 'image');
    params.append('from', 'resource');
    params.append('deleting[id]', imageId);
    params.append('deleting[hash]', imageHash);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://ibb.co/json', {
      method: 'POST',
      body: params,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      if (result.status_code === 200) return true;
    }
    throw new Error(`ImgBB Purge API error ${response.status}`);
  } catch (e: any) {
    if (retries > 1) {
      await new Promise(res => setTimeout(res, 2000));
      return purgeImageFromCDN(deleteUrl, retries - 1);
    }
    return false;
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
  badges: { type: [String], default: [] },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, { timestamps: true }));

const MetricSchema = new mongoose.Schema({
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

// Compound index để tối ưu việc tìm kiếm và ngăn chặn trùng lặp logic Upsert
MetricSchema.index({ userId: 1, date: 1 }, { unique: true });

const Metric = mongoose.model('Metric', MetricSchema);

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
    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }] });
    if (!user || user.password !== hashPassword(password)) return res.status(401).json({ message: 'Invalid credentials' });
    const u = user.toObject();
    delete u.password;
    res.json({ ...u, id: user._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/check-email', async (req, res) => {
  const { email, excludeUserId } = req.body;
  const query: any = { email: email.toLowerCase().trim() };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const exists = await User.exists(query);
  res.json({ exists: !!exists });
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
  res.json({ ...p.toObject(), id: p._id });
});

app.put('/api/posts/:id', async (req, res) => {
  try {
    const { content, existingImages, newImages } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const currentImages = post.images || [];
    const imagesToPurge = currentImages.filter(img => !existingImages.some((e: any) => e.url === img.url));
    if (imagesToPurge.length > 0) Promise.allSettled(imagesToPurge.map(img => purgeImageFromCDN(img.deleteUrl)));
    const uploadedNewImages = [];
    if (newImages && Array.isArray(newImages)) {
      for (const img of newImages) {
        if (img.startsWith('data:image')) {
          const imgData = await uploadToImgBB(img);
          if (imgData) uploadedNewImages.push(imgData);
        }
      }
    }
    const finalImages = [...existingImages, ...uploadedNewImages];
    post.content = content; post.images = finalImages as any; post.imageUrls = finalImages.map(i => i.url);
    await post.save();
    res.json({ ...post.toObject(), id: post._id });
  } catch (err: any) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Error' });
    if (post.images && post.images.length > 0) await Promise.allSettled(post.images.map(img => purgeImageFromCDN(img.deleteUrl)));
    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: 'Error' }); }
});

app.put('/api/posts/:id/react', async (req, res) => {
  try {
    const { userId, type, userName, userAvatar } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    let reactions = (post.reactions as any) || [];
    if (type === 'clear') { reactions = reactions.filter((r: any) => r.userId !== userId); }
    else {
      const index = reactions.findIndex((r: any) => r.userId === userId && r.type === type);
      if (index > -1) { reactions[index].count += 1; }
      else { reactions.push({ userId, type, userName, userAvatar, count: 1 }); }
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

app.put('/api/metrics/:id', async (req, res) => {
  try {
    const m = await Metric.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ ...m?.toObject(), id: m?._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/metrics/:id', async (req, res) => {
  try {
    await Metric.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const metrics = req.body;
    if (!Array.isArray(metrics)) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });

    console.log(`📊 [Metrics] Bắt đầu xử lý bulk upsert cho ${metrics.length} bản ghi...`);

    // Sử dụng bulkWrite để tối ưu hiệu năng và xử lý logic Upsert (Cập nhật nếu có, thêm mới nếu chưa)
    const operations = metrics.map(m => ({
      updateOne: {
        filter: { userId: m.userId, date: m.date },
        update: { $set: m },
        upsert: true
      }
    }));

    const result = await Metric.bulkWrite(operations);
    console.log(`✅ [Metrics] Hoàn tất bulk upsert: Created: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
    
    res.json({ 
      success: true, 
      upsertedCount: result.upsertedCount, 
      modifiedCount: result.modifiedCount 
    });
  } catch (err: any) { 
    console.error('❌ [Metrics] Lỗi lưu dữ liệu hàng loạt:', err.message);
    res.status(500).json({ message: 'Lỗi lưu dữ liệu hàng loạt: ' + err.message }); 
  }
});

app.post('/api/metrics/delete-bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    await Metric.deleteMany({ _id: { $in: ids } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

app.delete('/api/metrics/all/:userId', async (req, res) => {
  try {
    await Metric.deleteMany({ userId: req.params.userId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
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
