
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { transform } from 'sucrase';
import { UserRole, AccountStatus, HealthGoal } from './types';

dotenv.config();

const app = express();

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '10mb' }) as any);

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
  birthDate: String,
  height: Number,
  gender: String,
  healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  avatar: String
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const User = mongoose.model('User', userSchema);

const metricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number,
  bodyFat: Number,
  boneMinerals: Number,
  waterPercent: Number,
  muscleMass: Number,
  balanceIndex: Number,
  energy: Number,
  bioAge: Number,
  visceralFat: Number
}, { timestamps: true });

const Metric = mongoose.model('Metric', metricSchema);

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ 
  keyword: { type: String, required: true }, 
  content: { type: String, required: true } 
}));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ KẾT NỐI DATABASE THÀNH CÔNG');
    const admin = await User.findOne({ role: UserRole.ADMIN });
    if (!admin) {
      const newAdmin = new User({
        username: 'admin', 
        password: 'admin', 
        fullName: 'Tổng Quản Trị', 
        role: UserRole.ADMIN, 
        status: AccountStatus.ACTIVE, 
        healthGoal: HealthGoal.STRENGTHEN_HEALTH
      });
      await newAdmin.save();
      console.log('🚀 ĐÃ TẠO TÀI KHOẢN ADMIN MỚI: admin/admin');
    }
  } catch (err) { console.error('❌ LỖI KẾT NỐI DATABASE:', err); }
}

initDB();

// --- API ROUTES ---

// Auth
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password, status: AccountStatus.ACTIVE });
  if (!user) return res.status(401).json({ message: 'Sai thông tin hoặc tài khoản bị khóa' });
  res.json(user);
});

app.post('/api/register', async (req, res) => {
  try {
    const { username } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
    
    const newUser = new User({ ...req.body, role: UserRole.MEMBER, status: AccountStatus.ACTIVE });
    await newUser.save();
    res.json({ message: 'Đăng ký thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi đăng ký tài khoản' });
  }
});

// Users
app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.put('/api/users/:id', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
  res.json(user);
});
app.post('/api/users/:id/reset-password', async (req, res) => {
  const newPassword = 'Lucky' + Math.floor(Math.random() * 9000 + 1000);
  await User.findByIdAndUpdate(req.params.id, { password: newPassword });
  res.json({ newPassword });
});

// Metrics
app.get('/api/metrics/:userId', async (req, res) => {
  const metrics = await Metric.find({ userId: req.params.userId }).sort({ date: 1 });
  res.json(metrics);
});

app.get('/api/all-metrics', async (req, res) => {
  const metrics = await Metric.find().sort({ date: -1 });
  res.json(metrics);
});

app.post('/api/metrics', async (req, res) => {
  try {
    const metric = new Metric(req.body);
    await metric.save();
    res.json(metric);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lưu chỉ số' });
  }
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const result = await Metric.insertMany(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lưu chỉ số hàng loạt' });
  }
});

// Knowledge
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body);
  await k.save();
  res.json(k);
});
app.delete('/api/knowledge/:id', async (req, res) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

// Catch-all cho SPA
app.get(/^[^\.]*$/, (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API Not found' });
  res.sendFile(path.resolve('index.html'));
});

app.listen(PORT, () => console.log(`🚀 Lucky Hub Server đang chạy ổn định tại cổng ${PORT}`));
