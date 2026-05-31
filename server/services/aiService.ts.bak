import { GoogleGenAI, Type } from "@google/genai";
import { GeminiKey } from '../models/GeminiKey.ts';
import { logger } from '../../src/utils/logger.ts';

const ENV_API_KEYS = [
  process.env.API_KEY,
  process.env.API_KEY_2,
  process.env.API_KEY_3,
  process.env.GEMINI_API_KEY
].filter(k => !!k);

const keyCooldowns = new Map<string, number>();
const GEMINI_PROXY_URL = process.env.GEMINI_PROXY_URL;

// Biến lưu danh sách model khả dụng
export let discoveredModels: string[] = [];

// Cache health check status để tránh gọi liên tục
let lastHealthCheckTime = 0;
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 phút

/**
 * Task types để lựa chọn model phù hợp
 */
export type AITaskType = 'chat' | 'vision' | 'coach' | 'verify';

const MODEL_RECOMMENDATIONS: Record<AITaskType, string[]> = {
  chat: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'],
  coach: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'],
  vision: ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash'],
  verify: ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash'],
};

/**
 * Chọn model ưu tiên dựa trên task type và danh sách model khả dụng
 */
export function selectModelForTask(taskType: AITaskType): string {
  const recommendations = MODEL_RECOMMENDATIONS[taskType] || MODEL_RECOMMENDATIONS.chat;
  
  // Tìm model đầu tiên trong recommendations có trong discoveredModels
  for (const model of recommendations) {
    if (discoveredModels.includes(model)) {
      return model;
    }
  }
  
  // Fallback: trả về model đầu tiên trong discoveredModels hoặc hardcode
  if (discoveredModels.length > 0) {
    return discoveredModels[0];
  }
  
  return 'gemini-1.5-flash';
}

/**
 * Cập nhật health status cho một key trong DB
 */
async function updateKeyHealthStatus(keyId: string | null, status: string, models: string[], isFromDb: boolean) {
  if (!isFromDb || !keyId) return;
  try {
    await GeminiKey.findByIdAndUpdate(keyId, {
      healthStatus: status,
      workingModels: models,
      lastHealthCheck: new Date(),
    });
  } catch (err: any) {
    console.error(`[GEMINI] Failed to update health status for key ${keyId}:`, err?.message || err);
  }
}

/**
 * Kiểm tra nhanh một key (parallel-friendly)
 * Chỉ test 1-2 model đại diện
 */
async function quickKeyHealthCheck(key: string): Promise<{ valid: boolean; models: string[]; status: string }> {
  const baseEndpoint = (GEMINI_PROXY_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const testModels = ['gemini-1.5-flash', 'gemini-2.0-flash'];
  const workingModels: string[] = [];

  try {
    // Kiểm tra danh sách model trước
    const listUrl = `${baseEndpoint}/v1beta/models?key=${key}`;
    const listResp = await fetch(listUrl);
    const listData: any = await listResp.json();

    if (listData.error) {
      const msg = listData.error.message || "Unknown error";
      if (msg.toLowerCase().includes('location')) {
        return { valid: false, models: [], status: 'location_blocked' };
      }
      if (msg.toLowerCase().includes('key') || msg.toLowerCase().includes('api key')) {
        return { valid: false, models: [], status: 'error' };
      }
      return { valid: false, models: [], status: 'error' };
    }

    const candidates = (listData.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''))
      .filter((m: string) => m.includes('gemini'))
      .slice(0, 5); // Chỉ lấy 5 model đầu

    // Test nhanh 1 model đại diện (gemini-1.5-flash)
    const testModel = candidates.find((m: string) => m.includes('1.5-flash') || m.includes('2.0-flash')) || candidates[0];
    if (testModel) {
      const testUrl = `${baseEndpoint}/v1beta/models/${testModel}:generateContent?key=${key}`;
      const testResp = await fetch(testUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping' }] }] })
      });
      const testResults: any = await testResp.json();

      if (testResults.candidates) {
        workingModels.push(testModel);
        // Thêm các model khác vào danh sách working nếu có
        candidates.forEach((m: string) => {
          if (m !== testModel && !workingModels.includes(m)) {
            workingModels.push(m);
          }
        });
        return { valid: true, models: workingModels, status: 'healthy' };
      } else if (testResults.error) {
        const msg = testResults.error.message || "";
        if (msg.toLowerCase().includes('quota')) {
          return { valid: false, models: candidates, status: 'quota_exceeded' };
        }
        return { valid: false, models: candidates, status: 'error' };
      }
    }

    return { valid: false, models: workingModels, status: 'error' };
  } catch (err: any) {
    return { valid: false, models: [], status: 'error' };
  }
}

/**
 * Khám phá các model khả dụng - sử dụng parallel health check
 */
export async function discoverAvailableModels() {
  const ANSI = {
    cyan: '\x1b[1;36m', green: '\x1b[1;32m', yellow: '\x1b[1;33m',
    magenta: '\x1b[1;35m', blue: '\x1b[1;34m', red: '\x1b[1;31m',
    gray: '\x1b[90m', reset: '\x1b[0m'
  };

  console.log(`\n${ANSI.cyan}========== GEMINI SYSTEM DISCOVERY ==========${ANSI.reset}\n`);

  // Kiểm tra cache - Nếu đã check gần đây thì không chạy lại
  if (lastHealthCheckTime > 0 && Date.now() - lastHealthCheckTime < HEALTH_CHECK_INTERVAL) {
    console.log(`${ANSI.gray}↳ Bỏ qua health check (đã check cách đây ${Math.round((Date.now() - lastHealthCheckTime) / 1000)}s)${ANSI.reset}`);
    return;
  }

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
  const healthyKeys: string[] = [];

  // Parallel health check với Promise.allSettled
  console.log(`${ANSI.blue}Kiểm tra ${allKeys.length} key song song...${ANSI.reset}`);
  const healthResults = await Promise.allSettled(
    allKeys.map(async (key, index) => {
      const keyLabel = index === 0 ? "ENV Primary" : `Key ${index + 1}`;
      const result = await quickKeyHealthCheck(key);
      
      // Tìm DB key tương ứng để cập nhật
      const dbKey = dbKeys.find(k => k.key === key);
      const dbKeyId = dbKey?._id?.toString() || null;
      const isFromDb = !!dbKey;

      if (result.valid) {
        console.log(`    ${ANSI.green}[✓ WORKING]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}`);
        healthyKeys.push(key);
        // Cập nhật DB
        await updateKeyHealthStatus(dbKeyId, 'healthy', result.models, isFromDb);
        // Thêm models vào danh sách
        result.models.forEach((m: string) => {
          if (!discoveredModels.includes(m)) discoveredModels.push(m);
        });
      } else {
        let status = `${ANSI.red}[✗ ${result.status.toUpperCase()}]${ANSI.reset}`;
        console.log(`    ${status} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}`);
        await updateKeyHealthStatus(dbKeyId, result.status, result.models, isFromDb);
      }
    })
  );

  if (discoveredModels.length === 0) {
    console.log(`\n${ANSI.red}🚨 [BÁO ĐỘNG]: Server đang bị chặn toàn bộ bởi Google (Location/Keys).${ANSI.reset}`);
    if (!GEMINI_PROXY_URL) {
      console.log(`${ANSI.yellow}💡 Gợi ý: Hãy cấu hình GEMINI_PROXY_URL để vượt rào cản địa lý của Render.${ANSI.reset}`);
    }
  } else {
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

  lastHealthCheckTime = Date.now();
}

/**
 * Gọi AI với retry logic, hỗ trợ lựa chọn model theo task type
 */
export async function callAIWithRetry(
  requestId: string,
  modelName: string,
  payload: any,
  retries = 3,
  taskType: AITaskType = 'vision'
): Promise<any> {
  // Nếu modelName là 'auto' thì tự động chọn model dựa trên taskType
  const actualModelName = modelName === 'auto' ? selectModelForTask(taskType) : modelName;

  const modelRegistry = [
    actualModelName,
    ...discoveredModels,
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError: any = null;

  logger.info('AI', `[${requestId}] Task: ${taskType}, Starting with model: ${actualModelName}, Registry: [${modelRegistry.slice(0, 3).join(', ')}...]`);

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

      let availableKeys = allPotentialKeys.filter(k => {
        const cooldown = k.isFromDb ? (k as any).cooldownUntil : keyCooldowns.get(k.key);
        return !cooldown || new Date(cooldown).getTime() < now;
      });

      if (availableKeys.length === 0) {
        throw new Error("Tất cả API Keys hiện đang quá tải (QUOTA). Vui lòng thử lại sau.");
      }

      let selectedKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];

      try {
        let responseJson: any;
        const proxyEnabled = !!GEMINI_PROXY_URL && GEMINI_PROXY_URL.trim() !== "";

        if (proxyEnabled) {
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

          const mockResponse = {
            candidates: responseJson.candidates,
            text: responseJson.candidates?.[0]?.content?.parts?.[0]?.text || ""
          };

          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, { lastUsed: new Date(), failCount: 0 });
          }
          return mockResponse;
        } else {
          const ai = new GoogleGenAI({ apiKey: selectedKey.key });
          const response = await ai.models.generateContent({ model: currentModel, ...payload });

          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, { lastUsed: new Date(), failCount: 0 });
          }

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
          logger.warn('AI', `[${requestId}] Model ${currentModel} bị từ chối (location/version). Đang thử model fallback...`);
          break;
        }

        if (isOverloaded || isRateLimited) {
          const cooldownTime = now + 60000;
          if (selectedKey.isFromDb && selectedKey.id) {
            await GeminiKey.findByIdAndUpdate(selectedKey.id, {
              cooldownUntil: new Date(cooldownTime),
              $inc: { failCount: 1 }
            });
          } else {
            keyCooldowns.set(selectedKey.key, cooldownTime);
          }
          logger.warn('AI', `[${requestId}] Key bị rate limit (attempt ${attempt}/${retries}). Cooldown 60s.`);
          if (attempt < retries) continue;
        }

        if (!isLocationError && !isVersionError && !isOverloaded && !isRateLimited) throw err;
      }
    }
  }

  logger.error('AI', `[${requestId}] All models/keys exhausted. Last error: ${lastError?.message || 'Unknown'}`);
  throw lastError || new Error("Không thể kết nối với bất kỳ model Gemini nào khả dụng.");
}