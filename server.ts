
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { UserRole, AccountStatus, HealthGoal } from './types.ts';

dotenv.config();

const app = express();

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '10mb' }) as any);

// Hàm băm mật khẩu bằng SHA-256
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Middleware xử lý biên dịch TSX/TS cho trình duyệt
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
      console.error(`Lỗi biên dịch ${targetFile}:`, err);
      return res.status(500).send('Error compiling file');
    }
  }
  next();
});

app.use(express.static('.') as any);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
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
  avatar: String,
  isPasswordEncrypted: { type: Boolean, default: false }
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

// Đảm bảo tính duy nhất: Một người dùng chỉ có 1 bản ghi mỗi ngày
metricSchema.index({ userId: 1, date: 1 }, { unique: true });

const Metric = mongoose.model('Metric', metricSchema);

const chatSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  memberId: { type: String, required: true },
  coachId: { type: String, required: true },
  messages: [{
    id: String,
    senderId: String,
    senderName: String,
    senderRole: String,
    content: String,
    timestamp: String,
    imageUrl: String
  }]
}, { timestamps: true });

const Chat = mongoose.model('Chat', chatSchema);

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ 
  keyword: { type: String, required: true }, 
  content: { type: String, required: true } 
}));

const Rule = mongoose.model('Rule', new mongoose.Schema({ 
  content: { type: String, required: true } 
}));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ KẾT NỐI DATABASE THÀNH CÔNG');
    
    const admin = await User.findOne({ username: 'admin' });
    if (!admin) {
      const newAdmin = new User({
        username: 'admin', 
        password: hashPassword('admin'), 
        fullName: 'Tổng Quản Trị', 
        role: UserRole.ADMIN, 
        status: AccountStatus.ACTIVE, 
        healthGoal: HealthGoal.STRENGTHEN_HEALTH,
        phoneNumber: '0988888888',
        isPasswordEncrypted: true
      });
      await newAdmin.save();
      console.log('🚀 ĐÃ TẠO TÀI KHOẢN ADMIN MỚI (SECURE): admin/admin');
    }
  } catch (err) { console.error('❌ LỖI KẾT NỐI DATABASE:', err); }
}

initDB();

// --- API ROUTES ---

// Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, status: AccountStatus.ACTIVE });
  if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị khóa' });

  if (user.isPasswordEncrypted) {
    if (user.password !== hashPassword(password)) return res.status(401).json({ message: 'Sai mật khẩu' });
    res.json(user);
  } else {
    if (user.password !== password) return res.status(401).json({ message: 'Sai mật khẩu' });
    res.status(426).json({ message: 'Cần nâng cấp bảo mật', userId: user._id, fullName: user.fullName });
  }
});

app.post('/api/users/upgrade-password', async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  const user = await User.findById(userId);
  if (!user || user.password !== oldPassword) return res.status(401).json({ message: 'Xác minh thất bại' });
  user.password = hashPassword(newPassword);
  user.isPasswordEncrypted = true;
  await user.save();
  res.json({ message: 'Thành công' });
});

app.post('/api/register', async (req, res) => {
  const existing = await User.findOne({ username: req.body.username });
  if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
  const newUser = new User({ ...req.body, password: hashPassword(req.body.password), isPasswordEncrypted: true });
  await newUser.save();
  res.json({ message: 'Đăng ký thành công' });
});

// Chats
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id } = req.body;
  const chat = await Chat.findOneAndUpdate({ id }, req.body, { upsert: true, new: true });
  res.json(chat);
});

// Users
app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.put('/api/users/:id', async (req, res) => {
  const data = { ...req.body };
  if (data.password) data.password = hashPassword(data.password);
  const user = await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password');
  res.json(user);
});

// Metrics
app.get('/api/metrics/:userId', async (req, res) => res.json(await Metric.find({ userId: req.params.userId }).sort({ date: 1 })));
app.get('/api/all-metrics', async (req, res) => res.json(await Metric.find().sort({ date: -1 })));
app.post('/api/metrics', async (req, res) => res.json(await new Metric(req.body).save()));
app.post('/api/metrics/bulk', async (req, res) => res.json(await Metric.insertMany(req.body)));

// API xóa theo ngày để ghi đè
app.post('/api/metrics/delete-dates', async (req, res) => {
  const { userId, dates } = req.body;
  if (!userId || !dates || !Array.isArray(dates)) return res.status(400).json({ message: 'Thiếu thông tin' });
  await Metric.deleteMany({ userId, date: { $in: dates } });
  res.json({ message: 'Đã xóa các ngày trùng lặp' });
});

// Knowledge & Rules
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/knowledge', async (req, res) => res.json(await new Knowledge(req.body).save()));
app.delete('/api/knowledge/:id', async (req, res) => {
  await Knowledge.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' });
});

app.get('/api/rules', async (req, res) => res.json(await Rule.find()));
app.post('/api/rules', async (req, res) => res.json(await new Rule(req.body).save()));
app.delete('/api/rules/:id', async (req, res) => {
  await Rule.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' });
});

app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));

app.listen(PORT, () => console.log(`🚀 Lucky Hub Server hoạt động tại cổng ${PORT}`));
