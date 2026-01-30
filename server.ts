
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

const MAILEROO_CONFIG = {
  apiKey: process.env.MAILEROO_API_KEY,
  endpoint: 'https://smtp.maileroo.com/api/v2/emails', 
  fromEmail: process.env.SMTP_USER, 
  fromName: "Lucky Hub 2026"
};

const API_KEYS = [process.env.API_KEY, process.env.API_KEY_2, process.env.API_KEY_3].filter(k => !!k);

/**
 * KIỂM TRA TRẠNG THÁI GEMINI API KEYS
 */
async function validateGeminiKeys() {
  console.log('🔍 [Gemini] Đang kiểm tra trạng thái các API Keys...');
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i]!;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      // Thực hiện một request nhỏ để kiểm tra tính khả dụng của Key
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'ping',
      });
      
      if (response && response.text) {
        console.log(`✅ [Gemini] Key #${i + 1} (${key.substring(0, 6)}...): HOẠT ĐỘNG`);
      } else {
        throw new Error("Không nhận được phản hồi từ Model");
      }
    } catch (err: any) {
      console.error(`❌ [Gemini] Key #${i + 1} (${key.substring(0, 6)}...): LỖI - ${err.message}`);
    }
  }
}

/**
 * HÀM TIỆN ÍCH UPLOAD ẢNH LÊN IMGBB
 * @returns Object chứa url và delete_url
 */
async function uploadToImgBB(base64Data: string | undefined): Promise<{url: string, deleteUrl: string} | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;

  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) return null;

    const base64Image = base64Data.split(',')[1];
    const formData = new URLSearchParams();
    formData.append('image', base64Image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const result = await response.json();
    if (result.success) {
      return {
        url: result.data.url,
        deleteUrl: result.data.delete_url
      };
    }
    return null;
  } catch (error: any) {
    console.error('❌ [ImgBB] Error:', error.message);
    return null;
  }
}

/**
 * HÀM THỰC THI XÓA ẢNH TRÊN CDN (Dựa trên Reverse Engineering Document)
 * Có cơ chế Retry (thử lại) và Timeout (thời gian chờ)
 */
async function purgeImageFromCDN(deleteUrl: string, retries = 3): Promise<boolean> {
  if (!deleteUrl || !deleteUrl.includes('ibb.co')) return false;
  
  try {
    // 1. Bóc tách image_id và image_hash từ URL xóa
    const urlParts = deleteUrl.split('/').filter(p => p.length > 0);
    const imageHash = urlParts.pop();
    const imageId = urlParts.pop();

    if (!imageId || !imageHash) {
      console.warn(`⚠️ [CDN Purge] Không xác định được ID/Hash: ${deleteUrl}`);
      return false;
    }

    // 2. Chuẩn bị dữ liệu Form Data theo đặc tả kỹ thuật của ibb.co/json
    const formData = new URLSearchParams();
    formData.append('pathname', `/${imageId}/${imageHash}`);
    formData.append('action', 'delete');
    formData.append('delete', 'image');
    formData.append('from', 'resource');
    formData.append('deleting[id]', imageId);
    formData.append('deleting[hash]', imageHash);

    // 3. Cơ chế Timeout 10 giây
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    console.log(`🧹 [CDN Purge] Đang xóa (${4 - retries}/3): ${imageId}`);

    const response = await fetch('https://ibb.co/json', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result = await response.json();
      if (result.status_code === 200) {
        console.log(`✅ [CDN Purge] Thành công: ${imageId}`);
        return true;
      }
    }
    
    throw new Error(`ImgBB API error ${response.status}`);
  } catch (e: any) {
    // 4. Cơ chế Retry (Thử lại)
    if (retries > 1) {
      const waitTime = (4 - retries) * 2000; // Exponential-ish backoff
      console.warn(`🔄 [CDN Purge] Thất bại, đang thử lại sau ${waitTime}ms... (${e.message})`);
      await new Promise(res => setTimeout(res, waitTime));
      return purgeImageFromCDN(deleteUrl, retries - 1);
    }
    console.error(`❌ [CDN Purge] Thất bại hoàn toàn sau 3 lần thử: ${deleteUrl}`);
    return false;
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

const Metric = mongoose.model('Metric', new mongoose.Schema({
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
}, { timestamps: true }));

const Post = mongoose.model('Post', new mongoose.Schema({
  userId: String,
  userFullName: String,
  userAvatar: String,
  userBadges: [String],
  content: String,
  imageUrls: [String], 
  images: [{ url: String, deleteUrl: String }], 
  timestamp: String,
  reactions: [{ 
    userId: String, 
    userName: String, 
    userAvatar: String, 
    type: { type: String }, 
    count: { type: Number, default: 0 } 
  }]
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
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    // Kiểm tra API Keys ngay sau khi DB sẵn sàng
    await validateGeminiKeys();
  } catch (err: any) { console.error('❌ DB Error:', err.message); }
}
initDB();

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'connected' }));

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const imgData = await uploadToImgBB(avatar);
    const newUser = new User({ 
      ...rest, 
      username: username.toLowerCase().trim(), 
      email: email.toLowerCase().trim(), 
      password: hashPassword(password), 
      isPasswordEncrypted: true, 
      avatar: imgData?.url || avatar 
    });
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
  const p = new Post({ 
    ...data, 
    images: uploadedImages,
    imageUrls: uploadedImages.map(i => i.url) 
  });
  await p.save();
  res.json({ ...p.toObject(), id: p._id });
});

app.put('/api/posts/:id', async (req, res) => {
  try {
    const { content, existingImages, newImages } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // 1. Xác định và xóa ảnh bị gỡ khỏi bài viết
    const currentImages = post.images || [];
    const imagesToPurge = currentImages.filter(img => 
      !existingImages.some((e: any) => e.url === img.url)
    );

    // Xử lý xóa song song không chặn tiến trình update chính
    if (imagesToPurge.length > 0) {
      Promise.allSettled(imagesToPurge.map(img => purgeImageFromCDN(img.deleteUrl)));
    }

    // 2. Upload các ảnh mới lên ImgBB
    const uploadedNewImages = [];
    if (newImages && Array.isArray(newImages)) {
      for (const img of newImages) {
        if (img.startsWith('data:image')) {
          const imgData = await uploadToImgBB(img);
          if (imgData) uploadedNewImages.push(imgData);
        }
      }
    }

    // 3. Cập nhật dữ liệu vào MongoDB
    const finalImages = [...existingImages, ...uploadedNewImages];
    post.content = content;
    post.images = finalImages as any;
    post.imageUrls = finalImages.map(i => i.url);
    
    await post.save();
    res.json({ ...post.toObject(), id: post._id });
  } catch (err: any) {
    console.error('❌ [Post Update Error]:', err.message);
    res.status(500).json({ message: 'Lỗi cập nhật bài viết' });
  }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

    // 1. Dọn dẹp sạch sẽ ảnh trên ImgBB trước khi xóa record
    if (post.images && post.images.length > 0) {
      await Promise.allSettled(post.images.map(img => purgeImageFromCDN(img.deleteUrl)));
    }

    // 2. Xóa bản ghi trong MongoDB
    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ [Post Delete Error]:', err.message);
    res.status(500).json({ message: 'Lỗi khi xóa bài viết' }); 
  }
});

app.put('/api/posts/:id/react', async (req, res) => {
  try {
    const { userId, type, userName, userAvatar } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    let reactions = (post.reactions as any) || [];
    if (type === 'clear') {
      reactions = reactions.filter((r: any) => r.userId !== userId);
    } else {
      const index = reactions.findIndex((r: any) => r.userId === userId && r.type === type);
      if (index > -1) {
        reactions[index].count += 1;
      } else {
        reactions.push({ userId, type, userName, userAvatar, count: 1 });
      }
    }
    post.reactions = reactions;
    await post.save();
    res.json({ ...post.toObject(), id: post._id });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
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
app.get('/api/knowledge', async (req, res) => res.json((await Knowledge.find()).map(i => ({...i.toObject(), id: i._id}))));
app.get('/api/rules', async (req, res) => res.json((await Rule.find()).map(i => ({...i.toObject(), id: i._id}))));
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id, ...data } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, { ...data, id }, { upsert: true, new: true }));
});

app.use(express.static('.') as any);
app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
