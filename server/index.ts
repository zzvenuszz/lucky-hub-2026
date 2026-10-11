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
import aiProviderRoutes from './routes/aiProvider.routes.ts';
import mirrorRoutes from './routes/mirror.routes.ts';
import nutritionGroupRoutes from './routes/nutritionGroup.routes.ts';
import nutritionBranchRoutes from './routes/nutritionBranch.routes.ts';
import chatGroupRoutes from './routes/chatGroup.routes.ts';
import magicMirrorTokenRoutes from './routes/magicMirrorToken.routes.ts';
import systemBrandingRoutes from './routes/systemBranding.routes.ts';
import setupRoutes from './routes/setup.routes.ts';

// Services
import { discoverModelsForAllProviders } from './services/ai/modelDiscovery.ts';
import { initializeFirstRunConfiguration, initializeSetupAccessToken, isFirstRunSetupRequired, readPersistedSetup, resumePendingSetup } from './services/firstRunSetup.ts';
import { initChatWebSocket } from './websocket/chatSocket.ts';
import { magicMirrorAuth } from './middleware/magicMirrorAuth.ts';
import { authMiddleware } from './middleware/authMiddleware.ts';
import { requirePermission } from './middleware/requirePermission.ts';
import { RESOURCES } from './config/permissions.ts';

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
  max: 500,
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

// Rate limiter cho các API write (create/update/delete) - 20 requests/phút
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { message: 'Quá nhiều yêu cầu tạo/chỉnh sửa. Vui lòng thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', globalLimiter);
app.use('/api/setup', setupRoutes);
app.use('/api', async (req, res, next) => {
  if (req.path.startsWith('/setup/') || req.path === '/setup' || req.path === '/health') return next();
  try {
    if (await isFirstRunSetupRequired()) {
      return res.status(503).json({ message: 'Hoàn tất setup ban đầu trước khi sử dụng ứng dụng.', setupRequired: true });
    }
    next();
  } catch (error) {
    logger.error('SYSTEM', `Could not read first-run setup state: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ message: 'Không thể đọc trạng thái setup.' });
  }
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/forgot-password', authLimiter);
app.use('/api/reset-password', authLimiter);
app.use('/api/ai', aiLimiter);

// Áp dụng writeLimiter cho các route có thể gây nhiều write
app.use('/api/nutrition-groups', writeLimiter);
app.use('/api/chat-groups', writeLimiter);
app.use('/api/nutrition-branches', writeLimiter);

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
app.use('/api/system', systemBrandingRoutes);

// Protected API routes
app.use('/api/users', userRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/magic-mirror-tokens', magicMirrorTokenRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/admin/groups', groupRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin/ai', aiProviderRoutes);

// Nutrition Group routes
app.use('/api/nutrition-groups', nutritionGroupRoutes);

// Nutrition Branch routes
app.use('/api/nutrition-branches', nutritionBranchRoutes);

// Chat Group routes
app.use('/api/chat-groups', chatGroupRoutes);

// Magic Mirror routes require a dedicated device token.
app.use('/MM', magicMirrorAuth, mirrorRoutes);

// =============================================================================
// Legacy endpoints (vẫn giữ để tương thích)
// =============================================================================
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const statusCode = dbState === 'connected' ? 200 : 503;
  res.status(statusCode).json({ status: dbState === 'connected' ? 'ok' : 'unhealthy', database: dbState });
});

app.get('/api/audit-logs', authMiddleware, requirePermission(RESOURCES.SYSTEM.LOGS), async (req, res) => {
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
async function initDB(allowLocalFallback = true): Promise<boolean> {
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) {
    console.log('[FirstRunSetup] MongoDB URI is not configured; waiting for initial setup.');
    return false;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false
    });
    console.log('✅ Connected to MongoDB');
    return true;
  } catch (err: any) {
    console.error('❌ DB Error:', err.message);
    if (allowLocalFallback && !(await isFirstRunSetupRequired()) && mongoUri.includes('mongodb.net')) {
      const fallbackUri = 'mongodb://127.0.0.1:27017/lucky_hub';
      console.warn(`🔁 Falling back to local MongoDB at ${fallbackUri}`);
      try {
        await mongoose.connect(fallbackUri, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          bufferCommands: false
        });
        console.log('✅ Connected to local MongoDB fallback');
        return true;
      } catch (fallbackErr: any) {
        console.error('❌ Local DB fallback error:', fallbackErr.message);
      }
    }
    return false;
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
  let databaseConnected = false;
  let persistedSetup = await initializeFirstRunConfiguration();
  if (process.env.MONGODB_URI?.trim()) {
    databaseConnected = await initDB(!persistedSetup);
  } else {
    console.log('[FirstRunSetup] No MongoDB URI found; setup wizard will be shown.');
  }
  if (databaseConnected && persistedSetup && !persistedSetup.setupComplete) {
    try {
      await resumePendingSetup(persistedSetup);
      persistedSetup = await readPersistedSetup();
      databaseConnected = true;
    } catch (error) {
      databaseConnected = false;
      console.error('[FirstRunSetup] Could not resume setup:', error instanceof Error ? error.message : String(error));
    }
  }
  await initEmailService();
  initChatWebSocket(wss);

  if (await isFirstRunSetupRequired()) {
    const setupToken = initializeSetupAccessToken();
    console.warn('[FirstRunSetup] Setup is incomplete. Enter the following one-time access code in the setup wizard:');
    if (process.env.LUCKY_HUB_SETUP_TOKEN?.trim()) {
      console.warn('[FirstRunSetup] LUCKY_HUB_SETUP_TOKEN is configured; use its value from the deployment environment.');
    } else {
      console.warn(`[FirstRunSetup] One-time setup access code: ${setupToken}`);
    }
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    logger.info('SYSTEM', `Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('SYSTEM', `Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Not configured'}`);

    // New AI System Health Check
    console.log('\n\x1b[1;36m══════════ AI SYSTEM (NEW) ══════════\x1b[0m');
    console.log('\x1b[1;36m  🤖 Multi-provider AI Router loaded\x1b[0m');
    console.log('\x1b[1;36m  🔑 API Key based (no OAuth)\x1b[0m');
    console.log('\x1b[1;36m  🔄 Round-robin / Fallback / Priority strategies\x1b[0m');
    console.log('\x1b[1;36m  📊 Comprehensive logging with debug mode\x1b[0m');
    console.log('\x1b[1;36m══════════════════════════════════════\x1b[0m\n');

    // Run initial model discovery
    if (mongoose.connection.readyState === 1) {
      discoverModelsForAllProviders().catch((err: any) => {
        logger.error('SYSTEM', `AI model discovery failed: ${err?.message || err}`);
      });
    }
  });
}

startServer().catch((err: any) => {
  console.error('[SYSTEM] Failed to start server:', err?.message || err);
});

export default app;