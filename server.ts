
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { UserRole, AccountStatus, HealthGoal, Permission } from './types.ts';

dotenv.config();

const app = express();

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '10mb' }) as any);

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

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

const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({ keyword: String, content: String }));
const Rule = mongoose.model('Rule', new mongoose.Schema({ content: String }));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ DATABASE CONNECTED');
    const admin = await User.findOne({ username: 'admin' });
    if (!admin) {
      const newAdmin = new User({
        username: 'admin', 
        password: hashPassword('admin'), 
        fullName: 'Tổng Quản Trị', 
        role: UserRole.ADMIN, 
        status: AccountStatus.ACTIVE,
        permissions: Object.values(Permission),
        healthGoal: HealthGoal.STRENGTHEN_HEALTH,
        isPasswordEncrypted: true
      });
      await newAdmin.save();
    }
  } catch (err) { console.error('❌ DB ERROR:', err); }
}
initDB();

// API AUTH - LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });
  
  const user = await User.findOne({ username: username.toLowerCase().trim() });
  if (!user) return res.status(401).json({ message: 'Tài khoản không tồn tại' });
  if (user.status !== AccountStatus.ACTIVE) return res.status(403).json({ message: 'Tài khoản đã bị khóa' });

  if (user.isPasswordEncrypted) {
    if (user.password !== hashPassword(password)) return res.status(401).json({ message: 'Mật khẩu không chính xác' });
    res.json(user);
  } else {
    if (user.password !== password) return res.status(401).json({ message: 'Mật khẩu không chính xác' });
    res.status(426).json({ message: 'Yêu cầu nâng cấp mật khẩu bảo mật', userId: user._id, fullName: user.fullName });
  }
});

// API AUTH - REGISTER
app.post('/api/register', async (req, res) => {
  const { username, password, fullName, phoneNumber, healthGoal, height, weight, gender, birthDate } = req.body;
  try {
    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });

    const newUser = new User({
      username: username.toLowerCase().trim(),
      password: hashPassword(password),
      fullName,
      phoneNumber,
      healthGoal,
      height,
      weight,
      gender,
      birthDate,
      role: UserRole.MEMBER,
      status: AccountStatus.ACTIVE,
      isPasswordEncrypted: true,
      permissions: []
    });

    await newUser.save();
    res.json({ message: 'Đăng ký thành công', user: { fullName: newUser.fullName } });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi đăng ký: ' + err.message });
  }
});

// API USERS
app.get('/api/users', async (req, res) => res.json(await User.find().select('-password')));
app.put('/api/users/:id', async (req, res) => {
  const data = { ...req.body };
  if (data.username) data.username = data.username.toLowerCase().trim();
  if (data.password && data.isPasswordEncrypted) data.password = hashPassword(data.password);
  res.json(await User.findByIdAndUpdate(req.params.id, data, { new: true }).select('-password'));
});
app.delete('/api/users/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  await Metric.deleteMany({ userId: req.params.id });
  await Chat.deleteMany({ $or: [{ memberId: req.params.id }, { coachId: req.params.id }] });
  res.json({ message: 'User deleted' });
});

// API METRICS
app.get('/api/metrics/:userId', async (req, res) => res.json(await Metric.find({ userId: req.params.userId }).sort({ date: 1 })));
app.get('/api/all-metrics', async (req, res) => {
  const metrics = await Metric.find().populate('userId', 'fullName').sort({ date: -1 });
  const result = metrics.map(m => {
    const doc = m.toObject();
    return { ...doc, userFullName: (m.userId as any)?.fullName || 'Hội viên ẩn' };
  });
  res.json(result);
});
app.post('/api/metrics', async (req, res) => res.json(await new Metric(req.body).save()));
app.put('/api/metrics/:id', async (req, res) => res.json(await Metric.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/metrics/:id', async (req, res) => { await Metric.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); });
app.post('/api/metrics/bulk', async (req, res) => res.json(await Metric.insertMany(req.body)));
app.post('/api/metrics/delete-dates', async (req, res) => {
  const { userId, dates } = req.body;
  await Metric.deleteMany({ userId, date: { $in: dates } });
  res.json({ message: 'Ok' });
});

// API OTHER
app.get('/api/knowledge', async (req, res) => res.json(await Knowledge.find()));
app.post('/api/knowledge', async (req, res) => res.json(await new Knowledge(req.body).save()));
app.delete('/api/knowledge/:id', async (req, res) => { await Knowledge.findByIdAndDelete(req.params.id); res.json({ message: 'Ok' }); });
app.get('/api/rules', async (req, res) => res.json(await Rule.find()));
app.post('/api/rules', async (req, res) => res.json(await new Rule(req.body).save()));
app.delete('/api/rules/:id', async (req, res) => { await Rule.findByIdAndDelete(req.params.id); res.json({ message: 'Ok' }); });
app.get('/api/chats', async (req, res) => res.json(await Chat.find()));
app.post('/api/chats', async (req, res) => {
  const { id } = req.body;
  res.json(await Chat.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }));
});

app.get(/^[^\.]*$/, (req, res) => res.sendFile(path.resolve('index.html')));
app.listen(PORT, () => console.log(`🚀 Lucky Hub tại ${PORT}`));
