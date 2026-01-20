
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { UserRole, AccountStatus, HealthGoal } from './types';

dotenv.config();

const app = express();
// Express 5 middleware casting
app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '10mb' }) as any);

// Cấu hình phục vụ file tĩnh từ thư mục gốc
app.use(express.static('.') as any);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

// --- SCHEMAS ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: String,
  birthDate: String,
  height: Number,
  gender: String,
  healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  avatar: String
}, { timestamps: true });

const metricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: String,
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

const knowledgeSchema = new mongoose.Schema({
  keyword: String,
  content: String
});

const User = mongoose.model('User', userSchema);
const Metric = mongoose.model('Metric', metricSchema);
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

// --- DB INITIALIZATION & SEEDING ---
async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('--------------------------------------------------');
    console.log('✅ KẾT NỐI DATABASE THÀNH CÔNG');
    
    const admin = await User.findOne({ role: UserRole.ADMIN });
    if (!admin) {
      const pass = 'admin';
      const newAdmin = new User({
        username: 'admin',
        password: pass,
        fullName: 'Tổng Quản Trị',
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        healthGoal: HealthGoal.STRENGTHEN_HEALTH
      });
      await newAdmin.save();
      console.log('🚀 ĐÃ TẠO TÀI KHOẢN ADMIN MỚI');
      console.log('👉 Tên đăng nhập: admin');
      console.log(`👉 Mật khẩu: ${pass}`);
      console.log('--------------------------------------------------');
    } else {
      console.log('ℹ️  Tài khoản Admin đã tồn tại.');
      console.log('--------------------------------------------------');
    }
  } catch (err) {
    console.error('❌ LỖI KẾT NỐI DATABASE:', err);
  }
}

initDB();

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  if (dbStatus === 'connected') {
    res.status(200).json({ status: 'ok', database: dbStatus, uptime: (process as any).uptime() });
  } else {
    res.status(503).json({ status: 'unhealthy', database: dbStatus });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, fullName, birthDate, height, gender, healthGoal } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });

    const newUser = new User({
      username, password, fullName, birthDate, height, gender, healthGoal,
      role: UserRole.MEMBER,
      status: AccountStatus.ACTIVE
    });
    await newUser.save();
    res.json(newUser);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ message: 'Sai thông tin đăng nhập' });
  if (user.status === AccountStatus.SUSPENDED) return res.status(403).json({ message: 'Tài khoản đã bị tạm dừng' });
  res.json(user);
});

app.get('/api/users', async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

app.put('/api/users/:id', async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.post('/api/users/:id/reset-password', async (req, res) => {
  const newPass = Math.random().toString(36).slice(-8);
  await User.findByIdAndUpdate(req.params.id, { password: newPass });
  res.json({ message: 'Thành công', newPassword: newPass });
});

app.get('/api/metrics/:userId', async (req, res) => {
  const metrics = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(metrics);
});

app.get('/api/all-metrics', async (req, res) => {
  const metrics = await Metric.find().sort({ date: -1 });
  res.json(metrics);
});

app.post('/api/metrics', async (req, res) => {
  const metric = new Metric(req.body);
  await metric.save();
  res.json(metric);
});

app.post('/api/metrics/bulk', async (req, res) => {
  const results = await Metric.insertMany(req.body);
  res.json(results);
});

app.get('/api/knowledge', async (req, res) => {
  res.json(await Knowledge.find());
});

app.post('/api/knowledge', async (req, res) => {
  const k = new Knowledge(req.body);
  await k.save();
  res.json(k);
});

app.delete('/api/knowledge/:id', async (req, res) => {
  await Knowledge.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

// SPA Fallback: Trả về index.html cho bất kỳ route nào không phải API
// Lưu ý: Trong Express 5, ký tự '*' đơn lẻ không còn được hỗ trợ cho catch-all mà không có tên tham số.
// Sử dụng '(.*)' để khớp với tất cả các đường dẫn.
app.get('(.*)', (req, res) => {
  res.sendFile(path.resolve('index.html'));
});

app.listen(PORT, () => console.log(`🚀 Lucky Hub Server đang chạy tại cổng ${PORT}`));
