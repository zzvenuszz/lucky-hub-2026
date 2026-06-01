/**
 * Cline AI Service
 * 
 * Service giao tiếp với Cline API (OpenAI-compatible)
 * Endpoint: https://api.cline.bot/api/v1/chat/completions
 * Model: deepseek/deepseek-chat (tự động route đến deepseek/deepseek-v3)
 */

const CLINE_API_URL = 'https://api.cline.bot/api/v1/chat/completions';
const CLINE_API_TIMEOUT = 30000; // 30 giây

const ANSI = {
  cyan: '\x1b[1;36m',
  purple: '\x1b[1;35m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  red: '\x1b[1;31m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

/**
 * Format timestamp cho log
 */
function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Kiểm tra tính hợp lệ của Cline API Key bằng một request test
 */
export async function testClineKey(
  apiKey: string
): Promise<{ valid: boolean; models: string[]; status: string; error?: string }> {
  const startTime = Date.now();

  try {
    console.log(
      `[${getTimestamp()}] ${ANSI.purple}[CLINE]${ANSI.reset} Testing key: ${apiKey.substring(0, 6)}••••${apiKey.substring(apiKey.length - 4)}`
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLINE_API_TIMEOUT);

    const response = await fetch(CLINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Ping'
          }
        ],
        max_tokens: 5,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.log(
        `[${getTimestamp()}] ${ANSI.red}[CLINE KEY ERROR]${ANSI.reset} HTTP ${response.status}: ${errorText}`
      );
      return {
        valid: false,
        models: [],
        status: 'error',
        error: `HTTP ${response.status}: ${errorText}`
      };
    }

    const data = await response.json();

    // Kiểm tra response format OpenAI-compatible
    if (data?.success === true && data?.data?.choices?.[0]?.message?.content) {
      const duration = Date.now() - startTime;
      console.log(
        `[${getTimestamp()}] ${ANSI.green}[✓ CLINE WORKING]${ANSI.reset} Key ${apiKey.substring(0, 6)}••••${apiKey.substring(apiKey.length - 4)} | Response in ${duration}ms`
      );
      return {
        valid: true,
        models: ['deepseek/deepseek-chat', 'deepseek/deepseek-v3'],
        status: 'healthy'
      };
    }

    // Response không đúng format
    console.log(
      `[${getTimestamp()}] ${ANSI.red}[✗ CLINE INVALID]${ANSI.reset} Key ${apiKey.substring(0, 6)}••••${apiKey.substring(apiKey.length - 4)} | Unexpected response format`
    );
    return {
      valid: false,
      models: [],
      status: 'error',
      error: 'Invalid response format from Cline API'
    };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout ? 'Request timeout' : (err.message || 'Unknown error');

    console.log(
      `[${getTimestamp()}] ${ANSI.red}[✗ CLINE ERROR]${ANSI.reset} Key ${apiKey.substring(0, 6)}••••${apiKey.substring(apiKey.length - 4)} | ${errorMsg}`
    );

    return {
      valid: false,
      models: [],
      status: 'error',
      error: errorMsg
    };
  }
}

export type ClineMessage = { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> };

/**
 * Gọi Cline API với payload đầy đủ
 * Dùng cho các tác vụ thực tế sau này
 */
export async function callCline(
  requestId: string,
  apiKey: string,
  messages: ClineMessage[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<{ text: string; usage?: any }> {
  const model = options?.model || 'deepseek/deepseek-chat';
  const maxTokens = options?.maxTokens || 1024;
  const temperature = options?.temperature ?? 0.7;

  console.log(
    `[${getTimestamp()}] ${ANSI.purple}[CLINE CALL]${ANSI.reset} [${requestId}] Model: ${model}, Messages: ${messages.length}`
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLINE_API_TIMEOUT);

  try {
    const response = await fetch(CLINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Cline API HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Parse response OpenAI-compatible
    if (data?.success === true && data?.data?.choices?.[0]?.message?.content) {
      const content = data.data.choices[0].message.content;
      const usage = data.data.usage;

      console.log(
        `[${getTimestamp()}] ${ANSI.green}[✓ CLINE RESPONSE]${ANSI.reset} [${requestId}] Tokens: ${usage?.total_tokens || 'N/A'}`
      );

      return {
        text: content,
        usage
      };
    }

    throw new Error('Invalid response format from Cline API');
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new Error(`Cline API timeout after ${CLINE_API_TIMEOUT}ms`);
    }

  console.error(
    `[${getTimestamp()}] ${ANSI.red}[✗ CLINE FAILED]${ANSI.reset} [${requestId}] ${err.message}`
  );
  throw err;
  }
}

/**
 * Các model vision hỗ trợ trên Cline API
 * Ưu tiên model dễ hoạt động với vision/image_url
 */
export const CLINE_VISION_MODELS = [
  { id: 'google/gemini-2.5-flash', label: '⚡ Gemini 2.5 Flash (Khuyên dùng)' },
  { id: 'openai/gpt-4o-mini', label: '🤖 OpenAI GPT-4o Mini' },
  { id: 'qwen/qwen-2.5-vl', label: '🐉 Qwen 2.5 VL' },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct', label: '🦙 Llama 3.2 11B Vision' },
];

/**
 * Gọi Cline API cho tác vụ Vision (phân tích ảnh)
 * Sử dụng format OpenAI-compatible image_url
 */
export async function callClineVision(
  apiKey: string,
  model: string,
  imageBase64: string,
  prompt: string
): Promise<{ success: boolean; text?: string; error?: string; cost?: string; resolvedModel?: string }> {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7).toUpperCase();

  console.log(
    `[${getTimestamp()}] ${ANSI.purple}[CLINE VISION]${ANSI.reset} [${requestId}] Model: ${model}`
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(CLINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64 } }
            ]
          }
        ],
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(
        `[${getTimestamp()}] ${ANSI.red}[✗ CLINE VISION ERROR]${ANSI.reset} [${requestId}] HTTP ${response.status}: ${errorText.substring(0, 200)}`
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
      };
    }

    const data = await response.json();

    if (data?.success === true && data?.data?.choices?.[0]?.message?.content) {
      const content = data.data.choices[0].message.content;
      const cost = data.data.choices[0].message.provider_metadata?.gateway?.cost || '0';
      const resolvedModel = data.data.choices[0].message.provider_metadata?.gateway?.routing?.resolvedProvider || model;

      console.log(
        `[${getTimestamp()}] ${ANSI.green}[✓ CLINE VISION OK]${ANSI.reset} [${requestId}] ${duration}ms | Cost: $${cost} | Model: ${resolvedModel}`
      );

      return {
        success: true,
        text: content,
        cost: String(cost),
        resolvedModel
      };
    }

    console.error(
      `[${getTimestamp()}] ${ANSI.red}[✗ CLINE VISION INVALID]${ANSI.reset} [${requestId}] Unexpected response format`
    );
    return {
      success: false,
      error: 'Invalid response format from Cline Vision API'
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const errorMsg = isTimeout ? 'Request timeout after 60s' : (err.message || 'Unknown error');

    console.error(
      `[${getTimestamp()}] ${ANSI.red}[✗ CLINE VISION FAILED]${ANSI.reset} [${requestId}] ${errorMsg}`
    );

    return {
      success: false,
      error: errorMsg
    };
  }
}
