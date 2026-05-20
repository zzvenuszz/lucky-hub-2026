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

/**
 * Khám phá các model khả dụng
 */
export async function discoverAvailableModels() {
  const ANSI = {
    cyan: '\x1b[1;36m', green: '\x1b[1;32m', yellow: '\x1b[1;33m',
    magenta: '\x1b[1;35m', blue: '\x1b[1;34m', red: '\x1b[1;31m',
    gray: '\x1b[90m', reset: '\x1b[0m'
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
    const keyLabel = i === 0 ? "ENV Primary" : `Key ${i + 1}`;
    console.log(`${ANSI.blue}Kiểm tra [${keyLabel}]: ${key.substring(0, 6)}••••${key.substring(key.length - 4)}${ANSI.reset}`);

    try {
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
        .filter((m: string) => m.includes('gemini'));

      if (candidates.length === 0) {
        console.log(`    ${ANSI.gray}↳ Không tìm thấy model hỗ trợ generateContent cho key này.${ANSI.reset}`);
        continue;
      }

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

/**
 * Gọi AI với retry logic
 */
export async function callAIWithRetry(
  requestId: string,
  modelName: string,
  payload: any,
  retries = 3
): Promise<any> {
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
          logger.warn('AI', `Model ${currentModel} bị từ chối. Đang thử model fallback... (ID: ${requestId})`);
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
          if (attempt < retries) continue;
        }

        if (!isLocationError && !isVersionError && !isOverloaded && !isRateLimited) throw err;
      }
    }
  }

  throw lastError || new Error("Không thể kết nối với bất kỳ model Gemini nào khả dụng.");
}