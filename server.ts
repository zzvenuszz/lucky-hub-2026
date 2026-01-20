
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

/**
 * PHÂN TÍCH: Trình duyệt yêu cầu module mà thường bỏ qua .ts/.tsx.
 * CÁCH GIẢI QUYẾT: Middleware kiểm tra file tồn tại với extension tương ứng và biên dịch.
 */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();

  const rootDir = path.resolve();
  let relativePath = req.path;
  let filePath = path.join(rootDir, relativePath);

  // Thử tìm file với các đuôi mở rộng nếu không thấy file gốc
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
  fullName: String,
  birthDate: String,
  height: Number,
  gender: String,
  healthGoal: String,
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  avatar: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: String,
  weight: Number,
  bodyFat: Number,
  visceralFat: Number
}, { timestamps: true }));
const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ KẾT NỐI DATABASE THÀNH CÔNG');
    const admin = await User.findOne({ role: UserRole.ADMIN });
    if (!admin) {
      const newAdmin = new User({
        username: 'admin', password: 'admin', fullName: 'Tổng Quản Trị', role: UserRole.ADMIN, status: AccountStatus.ACTIVE, healthGoal: HealthGoal.STRENGTHEN_HEALTH
      });
      await newAdmin.save();
      console.log('🚀 ĐÃ TẠO TÀI KHOẢN ADMIN MỚI: admin/admin');
    }
  } catch (err) { console.error('❌ LỖI KẾT NỐI DATABASE:', err); }
}

initDB();

app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) return res.status(401).json({ message: 'Sai thông tin' });
  res.json(user);
});

// Catch-all cho SPA: Chỉ trả về index.html cho các đường dẫn không có dấu chấm (không phải file)
app.get(/^[^\.]*$/, (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API Not found' });
  res.sendFile(path.resolve('index.html'));
});

app.listen(PORT, () => console.log(`🚀 Lucky Hub Server đang chạy ổn định tại cổng ${PORT}`));
