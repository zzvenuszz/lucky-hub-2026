
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

// MIDDLEWARE QUAN TRỌNG: Biên dịch file .ts và .tsx sang JS trên server
app.get(['/*.ts', '/*.tsx'], (req, res, next) => {
  // PHÂN TÍCH: TypeScript báo lỗi do thuộc tính 'cwd' không tồn tại trên kiểu 'Process'.
  // CÁCH GIẢI QUYẾT: Sử dụng path.resolve() không tham số để lấy đường dẫn thư mục hiện tại thay cho process.cwd().
  // BÁO CÁO KẾT QUẢ: Đã thay thế process.cwd() bằng path.resolve() để đảm bảo tính tương thích và fix lỗi type.
  const filePath = path.join(path.resolve(), req.path);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Sử dụng sucrase để transpile cực nhanh
      const result = transform(content, {
        transforms: ['typescript', 'jsx'],
        production: false,
        jsxRuntime: 'automatic'
      });
      res.type('application/javascript').send(result.code);
    } catch (err) {
      console.error(`Lỗi biên dịch ${req.path}:`, err);
      res.status(500).send('Error compiling file');
    }
  } else {
    next();
  }
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

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'Not found' });
  res.sendFile(path.resolve('index.html'));
});

app.listen(PORT, () => console.log(`🚀 Lucky Hub Server đang chạy ổn định tại cổng ${PORT}`));
