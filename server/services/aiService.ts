import { GoogleGenAI, Type } from "@google/genai";
import { GeminiKey } from '../models/GeminiKey.ts';
import { logger } from '../../src/utils/logger.ts';
import { testClineKey, callCline, callClineVision, CLINE_VISION_MODELS, ClineMessage } from './clineService.ts';
import { getConfigValue, CONFIG_KEYS, AI_PROVIDERS, AIProvider } from '../models/AIConfig.ts';

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

const ANSI = {
  cyan: '\x1b[1;36m', green: '\x1b[1;32m', yellow: '\x1b[1;33m',
  magenta: '\x1b[1;35m', blue: '\x1b[1;34m', red: '\x1b[1;31m',
  gray: '\x1b[90m', reset: '\x1b[0m', purple: '\x1b[1;35m'
};

/**
 * Task types để lựa chọn model phù hợp
 */
export type AITaskType = 'chat' | 'vision' | 'coach' | 'verify';

/**
 * Cache provider chính (refresh mỗi 60s)
 */
let cachedActiveProvider: AIProvider | null = null;
let lastProviderCheck = 0;
const PROVIDER_REFRESH_MS = 60000;

/**
 * Lấy AI provider đang active, có cache
 */
export async function getActiveProvider(): Promise<AIProvider> {
  const now = Date.now();
  if (cachedActiveProvider && (now - lastProviderCheck < PROVIDER_REFRESH_MS)) {
    return cachedActiveProvider;
  }
  
  try {
    const value = await getConfigValue(CONFIG_KEYS.ACTIVE_PROVIDER);
    cachedActiveProvider = (value === AI_PROVIDERS.CLINE) ? AI_PROVIDERS.CLINE : AI_PROVIDERS.GEMINI;
    lastProviderCheck = now;
    console.log(`[AI Router] Active provider: ${cachedActiveProvider?.toUpperCase()}`);
    return cachedActiveProvider;
  } catch (err) {
    return AI_PROVIDERS.GEMINI; // fallback to Gemini
  }
}

/**
 * Lấy nhãn provider cho logging
 */
export function getProviderLabel(provider: AIProvider): string {
  return provider === AI_PROVIDERS.CLINE ? 'CLINE' : 'GEMINI';
}

/**
 * Xóa cache để refresh provider ngay lập tức
 */
export function resetProviderCache(): void {
  cachedActiveProvider = null;
  lastProviderCheck = 0;
  console.log(`[AI Router] Provider cache reset`);
}

/**
 * Lấy tất cả Cline API key active từ DB, shuffle để load balancing
 * Trả về mảng các key kèm label, đã lọc bỏ key đang cooldown
 */
async function getActiveClineKeys(): Promise<Array<{ key: string; label: string; id: any }>> {
  try {
    const now = Date.now();
    const clineKeys = await GeminiKey.find({ isActive: true, keyType: 'cline' });
    
    // Lọc key không cooldown
    const available = clineKeys
      .filter(k => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now)
      .map(k => ({ key: k.key, label: k.label, id: k._id }));
    
    // Shuffle Fisher-Yates để load balancing
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    
    if (clineKeys.length > 0 && available.length === 0) {
      console.log(`[AI Router] Tất cả ${clineKeys.length} Cline key đều đang cooldown!`);
    } else if (available.length > 0) {
      console.log(`[AI Router] Có ${available.length}/${clineKeys.length} Cline key sẵn sàng`);
    }
    
    return available;
  } catch (err) {
    console.error('[AI Router] Failed to get Cline keys:', err);
    return [];
  }
}

/**
 * Đánh dấu Cline key cooldown (khi bị rate limit)
 */
async function cooldownClineKey(keyId: any, reason: string): Promise<void> {
  if (!keyId) return;
  try {
    await GeminiKey.findByIdAndUpdate(keyId, {
      cooldownUntil: new Date(Date.now() + 60000),
      $inc: { failCount: 1 },
      lastUsed: new Date()
    });
    console.log(`[AI Router] Cline key cooldown 60s (${reason})`);
  } catch (err) {
    console.error('[AI Router] Failed to cooldown Cline key:', err);
  }
}

/**
 * Chuyển đổi payload Gemini format sang Cline messages cho text tasks
 */
function geminiPayloadToClineMessages(payload: any): ClineMessage[] {
  const messages: ClineMessage[] = [];
  
  // Nếu payload có systemInstruction
  if (payload.config?.systemInstruction) {
    messages.push({
      role: 'system',
      content: payload.config.systemInstruction
    });
  }
  
  // Nếu payload có contents
  if (payload.contents) {
    for (const content of payload.contents) {
      const role = content.role === 'model' ? 'assistant' : content.role || 'user';
      const parts = content.parts || [];
      
      const textParts: string[] = [];
      let hasImage = false;
      
      for (const part of parts) {
        if (part.text) {
          textParts.push(part.text);
        }
        if (part.inlineData) {
          hasImage = true;
        }
      }
      
      if (hasImage) {
        // Vision messages - handled by callClineVision separately
        messages.push({ role, content: textParts.join('\n') });
      } else {
        messages.push({ role, content: textParts.join('\n') });
      }
    }
  }
  
  return messages;
}

/**
 * Gọi AI routing thống nhất dựa trên activeProvider
 * Đây là hàm chính thay thế callAIWithRetry trong các route
 */
export async function callAI(
  requestId: string,
  taskType: AITaskType,
  payload: any,
  options?: {
    userId?: string;
    modelName?: string;
    retries?: number;
  }
): Promise<any> {
  const userId = options?.userId || 'anonymous';
  const retries = options?.retries ?? 3;
  const startTime = Date.now();
  
  // Lấy provider đang active
  const provider = await getActiveProvider();
  const providerLabel = getProviderLabel(provider);
  
  // Log request
  const taskLabels: Record<AITaskType, string> = {
    chat: 'Chat tư vấn',
    coach: 'Chat tư vấn',
    vision: 'Phân tích chỉ số từ ảnh',
    verify: 'Xác thực ảnh đại diện'
  };
  
  const taskLabel = taskLabels[taskType] || taskType;
  console.log(`\n${ANSI.cyan}╔══════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.cyan}║${ANSI.reset}  🟢 [AI] User: ${userId.padEnd(35)}${ANSI.reset}`);
  console.log(`${ANSI.cyan}║${ANSI.reset}  📡 Provider: [${providerLabel === 'CLINE' ? ANSI.purple + providerLabel : ANSI.blue + providerLabel}${ANSI.reset}]  Task: ${taskLabel.padEnd(20)}`);
  console.log(`${ANSI.cyan}║${ANSI.reset}  🆔 Request: ${requestId}`);
  console.log(`${ANSI.cyan}╚══════════════════════════════════════════════╝${ANSI.reset}`);
  logger.info('AI', `🟢 User: ${userId} → [${providerLabel}] (${taskLabel}) ID: ${requestId}`);
  
  try {
    // ===== NẾU LÀ CLINE =====
    if (provider === AI_PROVIDERS.CLINE) {
      const clineKeys = await getActiveClineKeys();
      if (clineKeys.length === 0) {
        console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Không có Cline key sẵn sàng! Fallback sang Gemini.${ANSI.reset}`);
        const result = await callAIWithRetry(requestId, options?.modelName || 'auto', payload, retries, taskType);
        const duration = Date.now() - startTime;
        console.log(`✅ [AI] User: ${userId} ← [GEMINI] (${taskLabel}) ID: ${requestId} - OK (${duration}ms)`);
        return result;
      }
      
      console.log(`${ANSI.purple}🔄 [AI] [${requestId}] Cline keys: ${clineKeys.length} available, trying rotation...${ANSI.reset}`);
      
      // Thử lần lượt từng Cline key (rotation)
      for (let ki = 0; ki < clineKeys.length; ki++) {
        const currentKey = clineKeys[ki];
        console.log(`${ANSI.purple}▶ [AI] [${requestId}] Cline attempt ${ki + 1}/${clineKeys.length}: "${currentKey.label}"${ANSI.reset}`);
        
        try {
          // Vision tasks (extract, bulk-extract, verify-avatar)
          if (taskType === 'vision' || taskType === 'verify') {
            let imageBase64 = '';
            let prompt = '';
            
            if (payload.contents?.[0]?.parts) {
              for (const part of payload.contents[0].parts) {
                if (part.inlineData?.data) {
                  imageBase64 = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
                }
                if (part.text) {
                  prompt += part.text + '\n';
                }
              }
            }
            
            if (!imageBase64) {
              console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Không tìm thấy ảnh trong payload!${ANSI.reset}`);
              break; // Không cần thử key khác
            }
            
            const visionModel = 'google/gemini-2.5-flash';
            console.log(`${ANSI.purple}▶ [AI] [${requestId}] Cline Vision: model=${visionModel}${ANSI.reset}`);
            
            const visionResult = await callClineVision(currentKey.key, visionModel, imageBase64, prompt || 'Phân tích ảnh này');
            
            if (visionResult.success) {
              const duration = Date.now() - startTime;
              console.log(`✅ [AI] User: ${userId} ← [CLINE] (${taskLabel}) ID: ${requestId} - OK (${duration}ms)`);
              return {
                candidates: [{ content: { parts: [{ text: visionResult.text }] } }],
                text: visionResult.text
              };
            }
            
            // Vision thất bại, cooldown key này, thử key tiếp theo
            console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Cline Vision key "${currentKey.label}" lỗi: ${visionResult.error}${ANSI.reset}`);
            await cooldownClineKey(currentKey.id, `vision_error: ${visionResult.error?.substring(0, 50)}`);
            continue; // Thử key tiếp theo
          }
          
          // Text tasks (chat, coach)
          const clineMessages = geminiPayloadToClineMessages(payload);
          
          if (clineMessages.length === 0) {
            console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Không thể convert payload!${ANSI.reset}`);
            break; // Không cần thử key khác
          }
          
          const clineModel = 'deepseek/deepseek-chat';
          console.log(`${ANSI.purple}▶ [AI] [${requestId}] Cline text: model=${clineModel}, msgs=${clineMessages.length}${ANSI.reset}`);
          
          const result = await callCline(requestId, currentKey.key, clineMessages, {
            model: clineModel,
            maxTokens: 2048,
            temperature: 0.7
          });
          
          const duration = Date.now() - startTime;
          console.log(`✅ [AI] User: ${userId} ← [CLINE] (${taskLabel}) ID: ${requestId} - OK (${duration}ms)`);
          return {
            candidates: [{ content: { parts: [{ text: result.text }] } }],
            text: result.text
          };
        } catch (err: any) {
          console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Cline key "${currentKey.label}" thất bại: ${err.message}${ANSI.reset}`);
          await cooldownClineKey(currentKey.id, `error: ${err.message?.substring(0, 50)}`);
          // Tiếp tục thử key tiếp theo trong vòng lặp
        }
      }
      
      // Hết keys Cline, fallback sang Gemini
      console.log(`${ANSI.yellow}⚠️ [AI] [${requestId}] Đã thử hết ${clineKeys.length} Cline key, fallback sang Gemini!${ANSI.reset}`);
      const result = await callAIWithRetry(requestId, options?.modelName || 'auto', payload, retries, taskType);
      const duration = Date.now() - startTime;
      console.log(`✅ [AI] User: ${userId} ← [GEMINI] (${taskLabel}) ID: ${requestId} - OK (${duration}ms)`);
      return result;
    }
    
    // ===== NẾU LÀ GEMINI (mặc định) =====
    console.log(`${ANSI.blue}▶ [AI] [${requestId}] Gemini: model=${options?.modelName || 'auto'}${ANSI.reset}`);
    const result = await callAIWithRetry(requestId, options?.modelName || 'auto', payload, retries, taskType);
    const duration = Date.now() - startTime;
    console.log(`✅ [AI] User: ${userId} ← [GEMINI] (${taskLabel}) ID: ${requestId} - OK (${duration}ms)`);
    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.log(`❌ [AI] User: ${userId} ← [${providerLabel}] (${taskLabel}) ID: ${requestId} - FAILED: ${err.message} (${duration}ms)`);
    throw err;
  }
}

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
  
  return 'gemini-2.0-flash';
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
 * Kiểm tra nhanh một key Gemini (parallel-friendly)
 * Chỉ test 1-2 model đại diện
 */
async function quickKeyHealthCheck(key: string): Promise<{ valid: boolean; models: string[]; status: string }> {
  const baseEndpoint = (GEMINI_PROXY_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
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
 * Hỗ trợ cả Gemini keys và Cline keys
 */
export async function discoverAvailableModels() {
  console.log(`\n${ANSI.cyan}========== AI SYSTEM DISCOVERY ==========${ANSI.reset}\n`);

  // Kiểm tra cache - Nếu đã check gần đây thì không chạy lại
  if (lastHealthCheckTime > 0 && Date.now() - lastHealthCheckTime < HEALTH_CHECK_INTERVAL) {
    console.log(`${ANSI.gray}↳ Bỏ qua health check (đã check cách đây ${Math.round((Date.now() - lastHealthCheckTime) / 1000)}s)${ANSI.reset}`);
    return;
  }

  let dbKeys: any[] = [];
  try {
    dbKeys = await GeminiKey.find({ isActive: true });
  } catch (err: any) {
    console.error('[AI] Failed to load API keys from DB:', err?.message || err);
  }

  // Phân loại keys theo keyType
  const geminiDbKeys = dbKeys.filter((k: any) => k.keyType === 'gemini' || !k.keyType);
  const clineDbKeys = dbKeys.filter((k: any) => k.keyType === 'cline');
  
  const allGeminiKeys = [...new Set([...ENV_API_KEYS, ...geminiDbKeys.map(k => k.key as string)])];
  const allClineKeys = [...new Set([...clineDbKeys.map(k => k.key as string)])];

  const totalKeys = allGeminiKeys.length + allClineKeys.length;
  if (totalKeys === 0) {
    console.log(`${ANSI.yellow}⚠️  CẢNH BÁO: Không tìm thấy bất kỳ API Key nào.${ANSI.reset}`);
    return;
  }

  discoveredModels = [];
  const healthyGeminiKeys: string[] = [];
  const healthyClineKeys: string[] = [];

  // ============ CHECK GEMINI KEYS ============
  if (allGeminiKeys.length > 0) {
    console.log(`\n${ANSI.blue}🔍 Kiểm tra ${allGeminiKeys.length} Gemini key(s)...${ANSI.reset}`);
    
    const geminiResults = await Promise.allSettled(
      allGeminiKeys.map(async (key, index) => {
        const keyLabel = index === 0 ? "ENV Primary" : `Gemini Key ${index + 1}`;
        const result = await quickKeyHealthCheck(key);
        
        const dbKey = dbKeys.find((k: any) => k.key === key);
        const dbKeyId = dbKey?._id?.toString() || null;
        const isFromDb = !!dbKey;

        if (result.valid) {
          console.log(`    ${ANSI.green}[✓ GEMINI WORKING]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}`);
          healthyGeminiKeys.push(key);
          await updateKeyHealthStatus(dbKeyId, 'healthy', result.models, isFromDb);
          result.models.forEach((m: string) => {
            if (!discoveredModels.includes(m)) discoveredModels.push(m);
          });
        } else {
          console.log(`    ${ANSI.red}[✗ ${result.status.toUpperCase()}]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}`);
          await updateKeyHealthStatus(dbKeyId, result.status, result.models, isFromDb);
        }
      })
    );
  }

  // ============ CHECK CLINE KEYS ============
  if (allClineKeys.length > 0) {
    console.log(`\n${ANSI.purple}🧠 Kiểm tra ${allClineKeys.length} Cline key(s)...${ANSI.reset}`);
    
    const clineResults = await Promise.allSettled(
      allClineKeys.map(async (key) => {
        const dbKey = clineDbKeys.find((k: any) => k.key === key);
        const keyLabel = dbKey?.label || 'Unnamed Cline Key';
        const dbKeyId = dbKey?._id?.toString() || null;
        const isFromDb = !!dbKey;

        try {
          const result = await testClineKey(key);

          if (result.valid) {
            console.log(`    ${ANSI.green}[✓ CLINE WORKING]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)} | Models: ${result.models.join(', ')}`);
            healthyClineKeys.push(key);
            await updateKeyHealthStatus(dbKeyId, 'healthy', result.models, isFromDb);
            result.models.forEach((m: string) => {
              if (!discoveredModels.includes(m)) discoveredModels.push(m);
            });
          } else {
            console.log(`    ${ANSI.red}[✗ CLINE ${result.status.toUpperCase()}]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}${result.error ? ` | ${result.error}` : ''}`);
            await updateKeyHealthStatus(dbKeyId, result.status, result.models, isFromDb);
          }
        } catch (err: any) {
          console.log(`    ${ANSI.red}[✗ CLINE ERROR]${ANSI.reset} ${keyLabel}: ${key.substring(0, 6)}••••${key.substring(key.length - 4)} | ${err.message}`);
          await updateKeyHealthStatus(dbKeyId, 'error', [], isFromDb);
        }
      })
    );
  }

  // ============ SUMMARY ============
  console.log(`\n${ANSI.cyan}========== AI DISCOVERY SUMMARY ==========${ANSI.reset}`);
  
  if (healthyGeminiKeys.length > 0) {
    console.log(`${ANSI.green}✅ Gemini: ${healthyGeminiKeys.length}/${allGeminiKeys.length} keys working${ANSI.reset}`);
  } else if (allGeminiKeys.length > 0) {
    console.log(`${ANSI.red}❌ Gemini: 0/${allGeminiKeys.length} keys working${ANSI.reset}`);
  }
  
  if (healthyClineKeys.length > 0) {
    console.log(`${ANSI.purple}✅ Cline: ${healthyClineKeys.length}/${allClineKeys.length} keys working${ANSI.reset}`);
  } else if (allClineKeys.length > 0) {
    console.log(`${ANSI.red}❌ Cline: 0/${allClineKeys.length} keys working${ANSI.reset}`);
  }

  if (discoveredModels.length === 0) {
    console.log(`\n${ANSI.red}🚨 [BÁO ĐỘNG]: Không có model nào khả dụng.${ANSI.reset}`);
    if (allGeminiKeys.length > 0 && !GEMINI_PROXY_URL) {
      console.log(`${ANSI.yellow}💡 Gợi ý: Hãy cấu hình GEMINI_PROXY_URL để vượt rào cản địa lý của Render.${ANSI.reset}`);
    }
  } else {
    discoveredModels.sort((a, b) => {
      const rank = (n: string) => {
        if (n.includes('gemini-2.0-flash') || n.includes('deepseek')) return 1;
        if (n.includes('gemini-1.5-flash')) return 2;
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
 * Gọi AI với retry logic (CHỈ Gemini - giữ nguyên cho fallback)
 * Hỗ trợ lựa chọn model theo task type
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
    'gemini-2.0-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite'
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError: any = null;

  logger.info('AI', `[${requestId}] Gemini Task: ${taskType}, Starting with model: ${actualModelName}, Registry: [${modelRegistry.slice(0, 3).join(', ')}...]`);

  for (const currentModel of modelRegistry) {
    let attempt = 0;
    while (attempt < retries) {
      attempt++;
      const now = Date.now();

      let dbKeys = await GeminiKey.find({ isActive: true });
      
      // CHỈ lấy Gemini keys cho callAIWithRetry
      const geminiDbKeys = dbKeys.filter((k: any) => k.keyType === 'gemini' || !k.keyType);
      
      let allPotentialKeys = [
        ...ENV_API_KEYS.map(k => ({ key: k, isFromDb: false, id: null })),
        ...geminiDbKeys.map(k => ({ key: k.key, isFromDb: true, id: k._id, cooldownUntil: k.cooldownUntil }))
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