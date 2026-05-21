/**
 * Lucky Hub 2026 - Server Entry Point
 * 
 * File này thay thế cho server.ts gốc.
 * Tất cả logic đã được tách thành các module trong thư mục server/
 */

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { transform } from 'sucrase';
import http from 'http';
import { WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import { logger } from '../src/utils/logger.ts';

// Routes
import authRoutes, { setEmailService } from './routes/auth.routes.ts';
import userRoutes from './routes/user.routes.ts';
import metricRoutes from './routes/metric.routes.ts';
import postRoutes from './routes/post.routes.ts';
import chatRoutes from './routes/chat.routes.ts';
import goalRoutes from './routes/goal.routes.ts';
import notificationRoutes from './routes/notification.routes.ts';
import adminRoutes from './routes/admin.routes.ts';
import knowledgeRoutes from './routes/knowledge.routes.ts';
import ruleRoutes from './routes/rule.routes.ts';
import groupRoutes from './routes/group.routes.ts';
import aiRoutes from './routes/ai.routes.ts';
import mirrorRoutes from './routes/mirror.routes.ts';
import nutritionGroupRoutes from './routes/nutritionGroup.routes.ts';
import nutritionBranchRoutes from './routes/nutritionBranch.routes.ts';
import chatGroupRoutes from './routes/chatGroup.routes.ts';

// Services
import { discoverAvailableModels } from './services/aiService.ts';
import { initChatWebSocket } from './websocket/chatSocket.ts';

// Config
import { migrationService } from '../src/services/migrationService.ts';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// =============================================================================
// Middleware
// =============================================================================
app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { message: 'Quá nhiều yêu cầu AI. Vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/reset-password', authLimiter);
app.use('/api/ai', aiLimiter);

// Global Request Logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/MM/')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.http(req.method, req.path, res.statusCode, duration, req.ip || 'unknown');
    });
  }
  next();
});

// =============================================================================
// API Routes
// =============================================================================

// Auth routes - không yêu cầu auth middleware (đã xử lý trong route)
app.use('/api', authRoutes);

// Protected API routes
app.use('/api/users', userRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/admin/groups', groupRoutes);
app.use('/api/ai', aiRoutes);

// Nutrition Group routes
app.use('/api/nutrition-groups', nutritionGroupRoutes);

// Nutrition Branch routes
app.use('/api/nutrition-branches', nutritionBranchRoutes);

// Chat Group routes
app.use('/api/chat-groups', chatGroupRoutes);

// Magic Mirror routes - KHÔNG auth
app.use('/MM', mirrorRoutes);

// =============================================================================
// Legacy endpoints (vẫn giữ để tương thích)
// =============================================================================
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const statusCode = dbState === 'connected' ? 200 : 503;
  res.status(statusCode).json({ status: dbState === 'connected' ? 'ok' : 'unhealthy', database: dbState });
});

app.get('/api/audit-logs', async (req, res) => {
  const AuditLog = mongoose.model('AuditLog');
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
  res.json(logs);
});

// =============================================================================
// Static files & SPA fallback
// =============================================================================
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/MM/')) return next();
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

app.use(express.static('.') as any);
app.get('*', (req, res) => res.sendFile(path.resolve('index.html')));

// =============================================================================
// Database & Server Start
// =============================================================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lucky_hub';

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    console.log('✅ Connected to MongoDB');
  } catch (err: any) {
    console.error('❌ DB Error:', err.message);
    if (MONGODB_URI.includes('mongodb.net')) {
      const fallbackUri = 'mongodb://127.0.0.1:27017/lucky_hub';
      console.warn(`🔁 Falling back to local MongoDB at ${fallbackUri}`);
      try {
        await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          bufferCommands: false
        });
        console.log('✅ Connected to local MongoDB fallback');
      } catch (fallbackErr: any) {
        console.error('❌ Local DB fallback error:', fallbackErr.message);
      }
    }
  }
}

async function initEmailService() {
  try {
    const { emailService: service } = await import('../services/emailService.ts');
    setEmailService(service);
    console.log('[SYSTEM] Email service initialized.');
  } catch (err: any) {
    console.error('[SYSTEM] Failed to initialize email service:', err?.message || err);
  }
}

async function startServer() {
  await initDB();
  await initEmailService();
  initChatWebSocket(wss);

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    logger.info('SYSTEM', `Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('SYSTEM', `Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);

    // Gemini Health Check
    discoverAvailableModels().catch((err: any) => {
      logger.error('SYSTEM', `Gemini health check failed: ${err?.message || err}`);
    });
  });
}

startServer().catch((err: any) => {
  console.error('[SYSTEM] Failed to start server:', err?.message || err);
});

export default app;