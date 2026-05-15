
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { transform } from 'sucrase';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserRole, AccountStatus, HealthGoal, Permission, AuditLogType } from './types.ts';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { logger } from './src/utils/logger.ts';
import { migrationService } from './src/services/migrationService.ts';
import { ttsService } from './src/services/ttsService.ts';
import { configService } from './src/services/configService.ts';
import { cryptoUtils } from './src/utils/cryptoUtils.ts';
import { audioUtils } from './src/utils/audioUtils.ts';

dotenv.config();

// Import services after dotenv config
// import { emailService } from './services/emailService.ts';

// Create email service instance after dotenv config
let emailService: any;
async function initEmailService() {
  try {
    const { emailService: service } = await import('./services/emailService.ts');
    emailService = service;
    console.log('[SYSTEM] Email service initialized.');
  } catch (err: any) {
    console.error('[SYSTEM] Failed to initialize email service:', err?.message || err);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket Server Logging
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  logger.ws(`New connection from ${ip}. Total clients: ${wss.clients.size}`);
  
  ws.on('message', (data) => {
    logger.ws(`Received message from ${ip}: ${data}`);
  });

  ws.on('close', () => {
    logger.ws(`Connection closed for ${ip}. Remaining clients: ${wss.clients.size}`);
  });

  ws.on('error', (err) => {
    logger.error('WS', `Error from ${ip}: ${err.message}`);
  });
});

// Broadcast to all connected Magic Mirrors
const broadcastToMirrors = (type: string, data: any) => {
  logger.ws(`Broadcasting ${type} to ${wss.clients.size} mirrors...`);
  const message = JSON.stringify({ type, data });
  let count = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      count++;
    }
  });
  logger.ws(`Successfully sent ${type} to ${count} active mirrors.`);
};

app.use(cors({ origin: '*' }) as any);
app.use(express.json({ limit: '50mb' }) as any);

// Global Request Logger for API and MM endpoints
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

const ENV_API_KEYS = [
  process.env.API_KEY, 
  process.env.API_KEY_2, 
  process.env.API_KEY_3,
  process.env.GEMINI_API_KEY
].filter(k => !!k);
const keyCooldowns = new Map<string, number>(); 
const GEMINI_PROXY_URL = process.env.GEMINI_PROXY_URL; // Cho phép bypass Location block
if (GEMINI_PROXY_URL) {
  logger.info('SYSTEM', `Gemini Proxy detected: ${GEMINI_PROXY_URL}`);
}

// Models
const GeminiKey = mongoose.model('GeminiKey', new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, default: 'Unnamed Key' },
  isActive: { type: Boolean, default: true },
  failCount: { type: Number, default: 0 },
  cooldownUntil: { type: Date, default: null },
  lastUsed: { type: Date, default: null }
}, { timestamps: true }));

// Biến lưu trữ danh sách model khả dụng sau khi scan
let discoveredModels: string[] = [];

/**
 * Khám phá các model khả dụng cho API Key hiện tại
 * Logic tối ưu hóa: Scan toàn bộ danh sách từ API và Ping kiểm tra thực tế
 */
async function discoverAvailableModels() {
  const ANSI = {
    cyan: '\x1b[1;36m',
    green: '\x1b[1;32m',
    yellow: '\x1b[1;33m',
    magenta: '\x1b[1;35m',
    blue: '\x1b[1;34m',
    red: '\x1b[1;31m',
    gray: '\x1b[90m',
    reset: '\x1b[0m'
  };

  console.log(`\n${ANSI.cyan}========== GEMINI SYSTEM DISCOVERY ==========${ANSI.reset}\n`);
  
  let dbKeys: any[] = [];
  try {
    dbKeys = await GeminiKey.find({ isActive: true });
  } catch (err: any) {
    console.error('[GEMINI] Failed to load API keys from DB:', err?.message || err);
  }

  const allKeys = [...new Set([...ENV_API_KEYS, ...dbKeys.map(k => k.key as string)])];
  
  if (allKeys.length === 0) {
    console.log(`${ANSI.yellow}⚠️  CẢNH BÁO: Không tìm thấy bất kỳ API Key nào.${ANSI.reset}`);
    return;
  }

  discoveredModels = [];
  const baseEndpoint = (GEMINI_PROXY_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  
  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    const keyLabel = i === 0 ? "ENV Primary" : `Key ${i+1}`;
    console.log(`${ANSI.blue}Kiểm tra [${keyLabel}]: ${key.substring(0, 6)}••••${key.substring(key.length-4)}${ANSI.reset}`);

    try {
      // 1. Lấy danh sách model mà Key này được phép truy cập
      const listUrl = `${baseEndpoint}/v1beta/models?key=${key}`;
      const listResp = await fetch(listUrl);
      const listData: any = await listResp.json();

      if (listData.error) {
        const msg = listData.error.message || "Unknown error";
        const code = listData.error.code || "?";
        let status = `${ANSI.red}[✗ LỖI KEY]${ANSI.reset}`;
        if (msg.toLowerCase().includes('location')) status = `${ANSI.magenta}[⚠ LOCATION]${ANSI.reset}`;
        console.log(`    ${status} ${msg} ${ANSI.gray}(code:${code})${ANSI.reset}`);
        continue;
      }

      const candidates = (listData.models || [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''))
        .filter((m: string) => m.includes('gemini')); // Chỉ lấy dòng Gemini

      if (candidates.length === 0) {
        console.log(`    ${ANSI.gray}↳ Không tìm thấy model hỗ trợ generateContent cho key này.${ANSI.reset}`);
        continue;
      }

      // 2. Ping thử các model để xác định model nào thực sự dùng được (vùng/hạn mức)
      // Test tối đa 10 model mỗi key để không bị nghẽn startup
      const testList = candidates.slice(0, 10);

      for (const model of testList) {
        try {
          const testUrl = `${baseEndpoint}/v1beta/models/${model}:generateContent?key=${key}`;
          const testResp = await fetch(testUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
          });
          const testResults: any = await testResp.json();

          if (testResults.candidates) {
            console.log(`    ${ANSI.green}[✓ WORKING]${ANSI.reset} ${model.padEnd(45)}`);
            if (!discoveredModels.includes(model)) discoveredModels.push(model);
          } else if (testResults.error) {
            const msg = testResults.error.message || "Unknown error";
            const code = testResults.error.code || "?";
            let status = `${ANSI.red}[✗ ERROR]${ANSI.reset}`;

            if (msg.toLowerCase().includes('quota')) status = `${ANSI.yellow}[⚠ QUOTA]${ANSI.reset}`;
            else if (msg.toLowerCase().includes('location')) status = `${ANSI.magenta}[⚠ LOCATION]${ANSI.reset}`;
            else if (msg.toLowerCase().includes('permission')) status = `${ANSI.blue}[⚠ PERM]${ANSI.reset}`;

            console.log(`    ${status} ${model.padEnd(45)} ${ANSI.gray}(code:${code})${ANSI.reset}`);
          }
        } catch (e: any) {
          console.log(`    ${ANSI.red}[✗ FAIL]${ANSI.reset} ${model.padEnd(45)} ${ANSI.gray}(Connection Fail)${ANSI.reset}`);
        }
      }
      
      // Nếu đã tìm thấy ít nhất 1 model hoạt động, ta có thể dừng scan key nếu muốn, 
      // nhưng tốt nhất là scan hết để có registry phong phú.
    } catch (err: any) {
      console.log(`    ${ANSI.red}✗ LỖI HỆ THỐNG:${ANSI.reset} ${err.message}`);
    }
  }

  if (discoveredModels.length === 0) {
    console.log(`\n${ANSI.red}🚨 [BÁO ĐỘNG]: Server đang bị chặn toàn bộ bởi Google (Location/Keys).${ANSI.reset}`);
    if (!GEMINI_PROXY_URL) {
      console.log(`${ANSI.yellow}💡 Gợi ý: Hãy cấu hình GEMINI_PROXY_URL để vượt rào cản địa lý của Render.${ANSI.reset}`);
    }
  } else {
    // Sắp xếp ưu tiên flash -> pro -> preview
    discoveredModels.sort((a, b) => {
      const rank = (n: string) => {
        if (n.includes('2.0-flash')) return 1;
        if (n.includes('1.5-flash')) return 2;
        if (n.includes('flash')) return 3;
        if (n.includes('pro')) return 4;
        return 5;
      };
      return rank(a) - rank(b);
    });
    console.log(`\n${ANSI.green}✅ AI DISCOVERY HOÀN TẤT. Sẵn sàng: ${ANSI.reset}${discoveredModels.join(', ')}`);
  }
  console.log(`\n${ANSI.cyan}=============================================${ANSI.reset}\n`);
}


async function callAIWithRetry(
  requestId: string,
  modelName: string,
  payload: any,
  retries = 3
): Promise<any> {
  // Ưu tiên dùng model yêu cầu, sau đó là danh sách đã khám phá, cuối cùng là mặc định ổn định nhất
  const modelRegistry = [
    modelName,
    ...discoveredModels,
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ].filter((v, i, a) => a.indexOf(v) === i); 

  let lastError: any = null;

  for (const currentModel of modelRegistry) {
    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      const now = Date.now();
      
      let dbKeys = await GeminiKey.find({ isActive: true });
      let allPotentialKeys = [
        ...ENV_API_KEYS.map(k => ({ key: k, isFromDb: false, id: null })),
        ...dbKeys.map(k => ({ key: k.key, isFromDb: true, id: k._id, cooldownUntil: k.cooldownUntil }))
      ];

      // Lọc bỏ key cooldown
      let availableKeys = allPotentialKeys.filter(k => {
        const cooldown = k.isFromDb ? (k as any).cooldownUntil : keyCooldowns.get(k.key);
        return !cooldown || new Date(cooldown).getTime() < now;
      });

      if (availableKeys.length === 0) {
        throw new Error("Tất cả API Keys hiện đang quá tải (QUOTA). Vui lòng thử lại sau.");
      }

      // Chọn ngẫu nhiên từ danh sách khả dụng
      let selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];

      try {
        let responseJson: any;
        const proxyEnabled = !!GEMINI_PROXY_URL && GEMINI_PROXY_URL.trim() !== "";
        
        if (proxyEnabled) {
          // Sử dụng fetch thủ công nếu có Proxy để bypass SDK limitations hoặc Location block
          const endpoint = `${GEMINI_PROXY_URL.replace(/\/$/, "")}/v1beta/models/${currentModel}:generateContent?key=${selectedKey.key}`;
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          responseJson = await resp.json();
          
          if (responseJson.error) {
            throw new Error(responseJson.error.message || "Proxy Error");
          }
          
          // Giả lập cấu trúc trả về để các hàm phía sau không bị lỗi
          const mockResponse = {
            candidates: responseJson.candidates,
            text: responseJson.candidates?.[0]?.content?.parts?.[0]?.text || ""
          };
          
          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, { lastUsed: new Date(), failCount: 0 });
          }
          return mockResponse;
        } else {
          // Sử dụng SDK gốc nếu không có Proxy
          const ai = new GoogleGenAI({ apiKey: selectedKey.key });
          const response = await ai.models.generateContent({ model: currentModel, ...payload });
          
          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, { lastUsed: new Date(), failCount: 0 });
          }
          
          // Trả về một object đồng nhất có thuộc tính .text là string
          return {
            candidates: response.candidates,
            text: response.text 
          };
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message?.toLowerCase() || '';
        
        const isLocationError = errMsg.includes('location is not supported');
        const isVersionError = errMsg.includes('model not found') || errMsg.includes('404');
        const isOverloaded = errMsg.includes('503') || errMsg.includes('overloaded');
        const isRateLimited = errMsg.includes('429') || errMsg.includes('quota');

        if (isLocationError || isVersionError) {
          // Lỗi này thuộc về Model + Vùng, bỏ qua model này thử model tiếp theo trong registry
          logger.warn('AI', `Model ${currentModel} bị từ chối (${isLocationError ? "LOCATION" : "404"}). Đang thử model fallback... (ID: ${requestId})`);
          break; 
        }
        
        if (isOverloaded || isRateLimited) {
          // Lỗi này thuộc về Key, đưa key vào cooldown
          const cooldownTime = now + 60000;
          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, { 
              cooldownUntil: new Date(cooldownTime),
              $inc: { failCount: 1 }
            });
          } else {
            keyCooldowns.set(selectedKey.key, cooldownTime);
          }
          if (attempt < retries) continue; 
        }
        
        if (!isLocationError && !isVersionError && !isOverloaded && !isRateLimited) throw err;
      }
    }
  }
  
  throw lastError || new Error("Không thể kết nối với bất kỳ model Gemini nào khả dụng.");
}

/**
 * Kiểm tra sức khỏe Gemini khi khởi động server
 */
async function checkGeminiHealth() {
  await discoverAvailableModels();
}

// AI API Endpoints
app.post('/api/ai/extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });
    
    let prompt = "Phân tích ảnh kết quả đo chỉ số InBody hoặc cân điện tử này. Trích xuất chính xác các số liệu. Nếu không thấy số liệu, hãy để là 0. Trả về JSON.";
    if (selectedYear) {
      prompt += ` Lưu ý: Nếu ngày đo không ghi rõ năm, hãy sử dụng năm ${selectedYear} cho kết quả (định dạng YYYY-MM-DD).`;
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }] ,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER }, waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER }, energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER }, date: { type: Type.STRING } }
        }
      }
    };
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json(JSON.parse(response.text));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/ai/bulk-extract', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    let prompt = "Trích xuất danh sách JSON nhiều dòng kết quả sức khỏe từ bảng viết tay.";
    if (selectedYear) {
      prompt += ` RẤT QUAN TRỌNG: Nếu ngày (ví dụ 10/05) không ghi rõ năm trong ảnh, hãy sử dụng năm ${selectedYear} để tạo ngày hoàn chỉnh dạng YYYY-MM-DD.`;
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { date: { type: Type.STRING }, weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER }, waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER }, energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER } }
          }
        }
      }
    };
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json(JSON.parse(response.text));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/ai/coach', async (req, res) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    const payload = { contents: [...history, { role: 'user', parts }], config: { systemInstruction } };
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json({ text: response.text });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Admin Gemini Key Endpoints
app.get('/api/admin/env-keys', (req, res) => {
  const keys = [
    { label: 'API_KEY (Primary)', key: process.env.API_KEY },
    { label: 'API_KEY_2 (Backup)', key: process.env.API_KEY_2 },
    { label: 'API_KEY_3 (Backup)', key: process.env.API_KEY_3 }
  ].filter(k => !!k.key).map(k => ({
    label: k.label,
    key: k.key, // Chúng ta vẫn trả về key full để frontend check trùng lặp (Admin only)
    display: `${k.key!.substring(0, 6)}••••${k.key!.substring(k.key!.length - 4)}`
  }));
  res.json(keys);
});

app.get('/api/admin/gemini-keys', async (req, res) => {
  try {
    const keys = await GeminiKey.find().sort({ createdAt: -1 });
    res.json(keys.map(k => ({ ...k.toObject(), id: k._id })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/gemini-keys', async (req, res) => {
  try {
    const { key, label } = req.body;
    
    // Check trùng lặp với ENV
    if (ENV_API_KEYS.includes(key)) {
      return res.status(400).json({ message: "KEY ĐÃ TỒN TẠI TRONG DANH SÁCH ENV" });
    }

    const newKey = new GeminiKey({ key, label });
    await newKey.save();
    res.json({ ...newKey.toObject(), id: newKey._id });
  } catch (err: any) { 
    res.status(400).json({ message: "KEY ĐÃ TỒN TẠI HOẶC KHÔNG HỢP LỆ" }); 
  }
});

app.delete('/api/admin/gemini-keys/:id', async (req, res) => {
  try {
    await GeminiKey.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.put('/api/admin/gemini-keys/:id/toggle', async (req, res) => {
  try {
    const { isActive } = req.body;
    await GeminiKey.findByIdAndUpdate(req.params.id, { isActive });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/gemini-keys/check', async (req, res) => {
  try {
    const { key } = req.body;
    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'ping',
    });
    if (response && response.text) res.json({ status: 'ok' });
    else throw new Error("No response");
  } catch (err: any) {
    res.status(400).json({ message: "Key không hoạt động: " + err.message });
  }
});

async function uploadToImgBB(base64Data: string | undefined): Promise<{url: string, deleteUrl: string} | null> {
  if (!base64Data || !base64Data.startsWith('data:image')) return null;
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    const base64Image = base64Data.split(',')[1];
    const params = new URLSearchParams();
    params.append('image', base64Image);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: 'POST', body: params });
    const result = await response.json();
    return result.success ? { url: result.data.url, deleteUrl: result.data.delete_url } : null;
  } catch (error: any) { return null; }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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

const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
  actorId: { type: String, required: true },
  actorName: { type: String, required: true },
  targetId: String,
  targetName: String,
  type: { type: String, required: true },
  details: { type: String, required: true },
  timestamp: { type: String, required: true }
}, { timestamps: true }));

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
  healthGoals: { type: [String], default: [] },
  role: { type: String, enum: Object.values(UserRole), default: UserRole.MEMBER },
  status: { type: String, enum: Object.values(AccountStatus), default: AccountStatus.ACTIVE },
  permissions: { type: [String], default: [] },
  avatar: String,
  avatarHash: String,
  isPasswordEncrypted: { type: Boolean, default: false },
  badges: { type: [String], default: [] }
}, { timestamps: true }));

const Metric = mongoose.model('Metric', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  weight: Number, bodyFat: Number, boneMinerals: Number, waterPercent: Number, muscleMass: Number,
  balanceIndex: { type: Number, default: 0 }, energy: Number, bioAge: Number, visceralFat: Number
}, { timestamps: true }));

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

// Login Attempt Schema (Chống brute-force đăng nhập)
const LoginAttempt = mongoose.model('LoginAttempt', new mongoose.Schema({
  identifier: { type: String, required: true, unique: true }, // email hoặc username
  count: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  lastAttempt: { type: Date, default: null }
}, { timestamps: true }));

// Active Session Schema (Theo dõi session đa thiết bị)
const ActiveSession = mongoose.model('ActiveSession', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, unique: true },
  device: { type: String, default: 'unknown' },
  ip: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  lastPing: { type: Date, default: null }
}, { timestamps: true }));

// Password Reset Token Schema
const PasswordResetToken = mongoose.model('PasswordResetToken', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false }
}, { timestamps: true }));

async function initDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      bufferCommands: false // Disable mongoose buffering
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

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const statusCode = dbState === 'connected' ? 200 : 503;
  res.status(statusCode).json({ status: dbState === 'connected' ? 'ok' : 'unhealthy', database: dbState });
});

app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  res.json({ exists: !!user });
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, avatar, ...rest } = req.body;
    const imgData = await uploadToImgBB(avatar);
    const finalAvatar = imgData?.url || avatar;
    const adminExists = await User.exists({ role: UserRole.ADMIN });
    const newUser = new User({ 
      ...rest, 
      username: username.toLowerCase().trim(), 
      email: email.toLowerCase().trim(), 
      password: hashPassword(password), 
      role: !adminExists ? UserRole.ADMIN : (rest.role || UserRole.MEMBER),
      isPasswordEncrypted: true, 
      avatar: finalAvatar,
      avatarHash: cryptoUtils.generateAvatarHash(finalAvatar)
    });
    await newUser.save();
    
    broadcastToMirrors('user:created', { 
      username: newUser.username, 
      fullName: newUser.fullName, 
      avatar: newUser.avatar, 
      avatarHash: (newUser as any).avatarHash 
    });

    // Audit Log
    const log = new AuditLog({
      actorId: newUser._id, actorName: newUser.fullName, type: AuditLogType.REGISTER,
      details: `Đăng ký tài khoản mới: @${newUser.username}`, timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ message: 'Success' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

// Hàm hủy session cũ và thông báo
async function invalidateOldSessions(userId: string, newSessionId: string, newDevice: string) {
  const oldSessions = await ActiveSession.find({
    userId,
    isActive: true,
    sessionId: { $ne: newSessionId }
  });

  for (const session of oldSessions) {
    session.isActive = false;
    await session.save();
    console.log(`[Session] Invalidated session ${session.sessionId} for user ${userId}`);
  }

  // Broadcast qua WebSocket để thông báo cho thiết bị cũ
  if (oldSessions.length > 0) {
    broadcastToMirrors('session:invalidated', {
      userId: userId.toString(),
      message: 'Tài khoản của bạn đã được đăng nhập từ thiết bị khác.',
      timestamp: new Date().toISOString()
    });
  }

  return oldSessions.length;
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const identifier = username.toLowerCase().trim();

    // Kiểm tra lockout
    const now = new Date();
    let attempt = await LoginAttempt.findOne({ identifier });

    if (attempt && attempt.lockUntil && attempt.lockUntil > now) {
      const remainingMs = attempt.lockUntil.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      console.log(`[Login] Blocked login for ${identifier}: locked for ${remainingMinutes} more minutes`);
      return res.status(429).json({
        message: `Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau ${remainingMinutes} phút.`,
        locked: true,
        remainingMinutes,
        lockUntil: attempt.lockUntil.toISOString()
      });
    }

    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier }]
    });

    if (!user || user.password !== hashPassword(password)) {
      // Đăng nhập sai: tăng count và kiểm tra lock
      if (!attempt) {
        attempt = new LoginAttempt({ identifier, count: 1, lastAttempt: now });
      } else {
        attempt.count = (attempt.count || 0) + 1;
        attempt.lastAttempt = now;
      }

      // Kiểm tra nếu cần lock
      if (attempt.count >= 5) {
        const blockIndex = Math.floor(attempt.count / 5);
        let lockMinutes: number;
        if (blockIndex === 1) {
          lockMinutes = 1;
        } else {
          lockMinutes = Math.min(1 + (blockIndex - 1) * 5, 60);
        }
        attempt.lockUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
        console.log(`[Login] Failed attempt #${attempt.count} for ${identifier}: locked for ${lockMinutes} minutes`);
      }

      await attempt.save();

      const remainingAttempts = 5 - (attempt.count % 5 || 5);
      console.log(`[Login] Failed login for ${identifier}: attempt #${attempt.count}`);

      return res.status(401).json({
        message: 'Sai thông tin đăng nhập',
        remainingAttempts,
        locked: attempt.lockUntil ? true : false,
        lockUntil: attempt.lockUntil?.toISOString() || null
      });
    }

    // Đăng nhập thành công: reset login attempts
    if (attempt) {
      await LoginAttempt.deleteOne({ identifier });
      console.log(`[Login] Successful login for ${identifier}: reset login attempts`);
    }

    if (user.status === AccountStatus.SUSPENDED) {
      return res.status(403).json({
        message: "Tài khoản của bạn bị lỗi. Vui lòng liên hệ với Quản trị viên hệ thống hoặc Nhóm dinh dưỡng bạn đang sinh hoạt để được hỗ trợ."
      });
    }

    // Tạo session mới
    const sessionId = crypto.randomBytes(32).toString('hex');
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Hủy các session cũ của user này
    const invalidatedCount = await invalidateOldSessions(user._id.toString(), sessionId, userAgent);
    
    // Lưu session mới
    const activeSession = new ActiveSession({
      userId: user._id,
      sessionId,
      device: userAgent.substring(0, 200),
      ip,
      isActive: true,
      lastPing: now
    });
    await activeSession.save();

    const u = user.toObject();
    delete u.password;
    console.log(`[Login] Successful login: @${user.username}, session=${sessionId.substring(0, 8)}..., invalidated=${invalidatedCount} old sessions`);
    res.json({
      ...u,
      id: user._id,
      email: user.email,
      sessionId,
      invalidatedOldSessions: invalidatedCount
    });
  } catch (err) {
    console.error(`[Login] Error:`, err);
    res.status(500).json({ message: 'Lỗi hệ thống' });
  }
});

// Session Ping Endpoint - Client gọi mỗi 30s để kiểm tra session còn hiệu lực
app.post('/api/session/ping', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(401).json({ valid: false, message: 'Thiếu sessionId' });
    }

    const session = await ActiveSession.findOne({ sessionId, isActive: true });
    if (!session) {
      return res.status(401).json({
        valid: false,
        message: 'Session đã hết hạn hoặc bị hủy do đăng nhập từ thiết bị khác.',
        reason: 'session_invalidated'
      });
    }

    // Cập nhật thời gian ping cuối
    session.lastPing = new Date();
    await session.save();

    res.json({ valid: true });
  } catch (err: any) {
    console.error(`[Session] Ping error:`, err.message);
    res.status(500).json({ valid: false, message: 'Lỗi hệ thống' });
  }
});

// Forgot Password Endpoint
app.post('/api/forgot-password', async (req, res) => {
  console.log('[FORGOT-PASSWORD] Request received:', { email: req.body.email, timestamp: new Date().toISOString() });

  try {
    const { email } = req.body;

    if (!email) {
      console.log('[FORGOT-PASSWORD] Missing email parameter');
      return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    console.log('[FORGOT-PASSWORD] Processing email:', email.toLowerCase().trim());

    // Find user by email
    console.log('[FORGOT-PASSWORD] Looking up user in database...');
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    console.log('[FORGOT-PASSWORD] User lookup result:', user ? { id: user._id, email: user.email } : 'User not found');

    if (!user) {
      // Don't reveal if email exists or not for security
      console.log('[FORGOT-PASSWORD] User not found, returning generic message');
      return res.json({ message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' });
    }

    // Generate reset token
    console.log('[FORGOT-PASSWORD] Generating reset token...');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    console.log('[FORGOT-PASSWORD] Token generated, expires at:', expiresAt.toISOString());

    // Save reset token
    console.log('[FORGOT-PASSWORD] Saving token to database...');
    const tokenDoc = new PasswordResetToken({
      userId: user._id,
      token: resetToken,
      email: user.email,
      expiresAt
    });
    await tokenDoc.save();
    console.log('[FORGOT-PASSWORD] Token saved successfully');

    // Send reset email
    console.log('[FORGOT-PASSWORD] Sending reset email...');
    const emailSent = await emailService.sendPasswordResetEmail(user.email, resetToken, user.fullName);
    console.log('[FORGOT-PASSWORD] Email send result:', emailSent);

    if (emailSent) {
      // Audit Log
      console.log('[FORGOT-PASSWORD] Creating audit log...');
      const log = new AuditLog({
        actorId: user._id,
        actorName: user.fullName,
        type: AuditLogType.LOGIN, // Using LOGIN type for password reset
        details: `Yêu cầu đặt lại mật khẩu cho email: ${user.email}`,
        timestamp: new Date().toISOString()
      });
      await log.save();
      console.log('[FORGOT-PASSWORD] Audit log saved');

      console.log('[FORGOT-PASSWORD] Success response sent');
      res.json({ message: 'Hướng dẫn đặt lại mật khẩu đã được gửi đến email của bạn.' });
    } else {
      console.log('[FORGOT-PASSWORD] Email send failed, sending error response');
      res.status(500).json({ message: 'Không thể gửi email. Vui lòng thử lại sau.' });
    }
  } catch (err: any) {
    console.error(`[FORGOT-PASSWORD] Error: ${err.message}`);
    console.error(`[FORGOT-PASSWORD] Stack trace:`, err.stack);
    res.status(500).json({ message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
  }
});

// Reset Password Endpoint
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token và mật khẩu mới là bắt buộc' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    // Find and validate token
    const tokenDoc = await PasswordResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenDoc) {
      return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
    }

    // Find user
    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    // Update password
    user.password = hashPassword(newPassword);
    user.isPasswordEncrypted = true;
    await user.save();

    // Reset login attempts khi đổi mật khẩu
    try {
      await LoginAttempt.deleteOne({ identifier: user.email });
      await LoginAttempt.deleteOne({ identifier: user.username });
      console.log(`[ResetPassword] Reset login attempts for ${user.email}`);
    } catch (e) {
      // Không ảnh hưởng đến luồng chính
    }

    // Mark token as used
    tokenDoc.used = true;
    await tokenDoc.save();

    // Audit Log
    const log = new AuditLog({
      actorId: user._id,
      actorName: user.fullName,
      type: AuditLogType.LOGIN,
      details: `Đặt lại mật khẩu thành công`,
      timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ message: 'Mật khẩu đã được đặt lại thành công. Bạn có thể đăng nhập với mật khẩu mới.' });
  } catch (err: any) {
    console.error(`[RESET-PASSWORD] Error: ${err.message}`);
    res.status(500).json({ message: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
  }
});

// Verify Reset Token Endpoint
app.get('/api/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const tokenDoc = await PasswordResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenDoc) {
      return res.status(400).json({ valid: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
    }

    res.json({ valid: true, email: tokenDoc.email });
  } catch (err: any) {
    console.error(`[VERIFY-TOKEN] Error: ${err.message}`);
    res.status(500).json({ valid: false, message: 'Lỗi hệ thống' });
  }
});

app.get('/api/audit-logs', async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
  res.json(logs);
});

app.get('/api/users', async (req, res) => {
  const u = await User.find();
  res.json(u.map(item => ({ ...item.toObject(), id: item._id })));
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const data = req.body;
    if (data.avatar && data.avatar.startsWith('data:image')) {
      const imgData = await uploadToImgBB(data.avatar);
      if (imgData) {
        data.avatar = imgData.url;
        console.log(`[USER] Avatar uploaded to ImgBB: ${imgData.url}`);
      }
    }
    
    // Nếu có mật khẩu mới, thực hiện hash
    if (data.password && data.password.trim() !== '') {
      data.password = hashPassword(data.password);
      data.isPasswordEncrypted = true;
    } else {
      // Nếu password gửi lên là rỗng hoặc không có, xóa khỏi data để tránh ghi đè mật khẩu cũ bằng rỗng
      delete data.password;
    }

    if (data.avatar) {
      data.avatarHash = cryptoUtils.generateAvatarHash(data.avatar);
    }

    const u = await User.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!u) return res.status(404).json({ message: 'User not found' });
    
    broadcastToMirrors('user:updated', { 
      username: u.username, 
      fullName: u.fullName, 
      avatar: u.avatar, 
      avatarHash: (u as any).avatarHash 
    });

    const result = u.toObject();
    delete result.password;
    res.json({ ...result, id: u._id });
  } catch (err: any) {
    console.error(`[USER] Update error: ${err.message}`);
    res.status(500).json({ message: err.message });
  }
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

  // Audit Log
  const log = new AuditLog({
    actorId: p.userId, actorName: p.userFullName, type: AuditLogType.POST_CREATE,
    details: `Đăng bài viết mới: "${p.content?.substring(0, 50)}..."`, timestamp: new Date().toISOString()
  });
  await log.save();

  res.json({ ...p.toObject(), id: p._id });
});

app.get('/api/metrics/:userId', async (req, res) => {
  const m = await Metric.find({ userId: req.params.userId }).sort({ date: -1 });
  res.json(m.map(item => ({ ...item.toObject(), id: item._id })));
});

app.post('/api/metrics', async (req, res) => {
  const { actorId, actorName, ...metricData } = req.body;
  const m = new Metric(metricData);
  await m.save();

  // Xác định Target
  const target = await User.findById(metricData.userId);
  const isHelp = actorId && actorId !== metricData.userId.toString();
  
  const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
  const details = isHelp 
    ? `Cập nhật chỉ số giúp hội viên ${target?.fullName}`
    : `Tự cập nhật chỉ số cá nhân`;

  const log = new AuditLog({
    actorId: actorId || metricData.userId, actorName: actorName || target?.fullName || 'Hội viên',
    targetId: metricData.userId, targetName: target?.fullName,
    type: logType, details, timestamp: new Date().toISOString()
  });
  await log.save();

  res.json({ ...m.toObject(), id: m._id });
});

app.post('/api/metrics/bulk', async (req, res) => {
  try {
    const { metrics, actorId, actorName } = req.body;
    if (!Array.isArray(metrics) || metrics.length === 0) return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });

    const targetUserId = metrics[0].userId;
    const target = await User.findById(targetUserId);

    const operations = metrics.map(m => ({
      updateOne: { filter: { userId: m.userId, date: m.date }, update: { $set: m }, upsert: true }
    }));
    const result = await Metric.bulkWrite(operations);

    // Audit Log
    const isHelp = actorId && actorId !== targetUserId.toString();
    const logType = isHelp ? AuditLogType.METRIC_HELP_UPDATE : AuditLogType.METRIC_UPDATE;
    const details = isHelp 
      ? `Cập nhật hàng loạt ${metrics.length} chỉ số giúp hội viên ${target?.fullName}`
      : `Tự cập nhật hàng loạt ${metrics.length} chỉ số cá nhân`;

    const log = new AuditLog({
      actorId: actorId || targetUserId, actorName: actorName || target?.fullName || 'Hội viên',
      targetId: targetUserId, targetName: target?.fullName,
      type: logType, details, timestamp: new Date().toISOString()
    });
    await log.save();

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
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

// Magic Mirror (MM) Integration Endpoints

app.get('/MM/config', async (req, res) => {
  try {
    const config = await configService.getMirrorConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/tts/greeting/:name', async (req, res) => {
  const name = req.params.name;
  const customPrompt = req.query.prompt as string;
  
  try {
    const audioBuffer = await ttsService.generateGreeting(name, customPrompt, callAIWithRetry);
    
    if (audioBuffer) {
      res.set('Content-Type', 'audio/wav');
      res.send(audioBuffer);
    } else {
      // If audio generation returns null (e.g. location blocked), return 204 No Content
      logger.warn('TTS', `Audio generation returned null for: ${name}. Sending 204.`);
      res.status(204).end();
    }
  } catch (err: any) {
    logger.error('TTS', `API Error for ${name}: ${err.message}`);
    // Return 500 with the actual error message so the mirror can log it
    res.status(500).json({ message: err.message });
  }
});

app.get('/MM/:username/info', async (req, res) => {
  const username = req.params.username.toLowerCase().trim();
  console.log(`[MM] Request info for user: ${username} from ${req.ip}`);
  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`[MM] User not found: ${username}`);
      return res.status(404).json({ message: 'User not found' });
    }
    const u = user.toObject();
    delete u.password;
    console.log(`[MM] Successfully returned info for: ${username}`);
    res.json({ ...u, id: user._id });
  } catch (err: any) { 
    console.error(`[MM] Info error for ${username}:`, err.message);
    res.status(500).json({ message: err.message }); 
  }
});

app.get('/MM/:username/metrics/:n', async (req, res) => {
  const username = req.params.username.toLowerCase().trim();
  const n = parseInt(req.params.n) || 1;
  console.log(`[MM] Request metrics for user: ${username} (limit: ${n}) from ${req.ip}`);
  try {
    const user = await User.findOne({ username });
    if (!user) {
      console.warn(`[MM] User not found for metrics: ${username}`);
      return res.status(404).json({ message: 'User not found' });
    }
    
    const metrics = await Metric.find({ userId: user._id })
      .sort({ date: -1 })
      .limit(n);
    
    console.log(`[MM] Successfully returned ${metrics.length} metrics for: ${username}`);
    res.json(metrics.map(m => ({ ...m.toObject(), id: m._id })));
  } catch (err: any) { 
    console.error(`[MM] Metrics error for ${username}:`, err.message);
    res.status(500).json({ message: err.message }); 
  }
});

app.get('/MM/users/sync', async (req, res) => {
  try {
    const users = await User.find({}, 'username fullName avatar avatarHash updatedAt');
    const usersWithAvatar = users.filter(u => !!u.avatar);
    console.log(`[MM] Sync request from ${req.ip}. Total users: ${users.length}, Users with avatar: ${usersWithAvatar.length}`);
    
    res.json(users.map(u => ({
      username: u.username,
      fullName: u.fullName,
      avatar: u.avatar,
      avatarHash: (u as any).avatarHash,
      updatedAt: (u as any).updatedAt
    })));
  } catch (err: any) { 
    console.error(`[MM] Sync error: ${err.message}`);
    res.status(500).json({ message: err.message }); 
  }
});

app.use(express.static('.') as any);
app.get('*', (req, res) => res.sendFile(path.resolve('index.html')));

async function startServer() {
  await initDB();
  await initEmailService();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    logger.info('SYSTEM', `Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('SYSTEM', `Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);

    // Gemini Health Check
    checkGeminiHealth().catch((err: any) => {
      logger.error('SYSTEM', `Gemini health check failed: ${err?.message || err}`);
    });
  });
}

startServer().catch((err: any) => {
  console.error('[SYSTEM] Failed to start server:', err?.message || err);
});
