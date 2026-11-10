import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { optionalAuth } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { callAI, callAIWithRetry, AITaskType } from '../services/ai/index.ts';
import { Type } from "@google/genai";

const router = Router();

/**
 * Sanitize response text từ AI: loại bỏ markdown code block (```json ... ```)
 * để đảm bảo JSON.parse không bị lỗi
 */
function sanitizeJSON(text: string): string {
  if (!text) return text;
  let cleaned = text.trim();
  // Loại bỏ thẻ suy luận <think>...</think> (hoặc <think> chưa đóng) của các model reasoning
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^<think>[\s\S]*$/gi, '').trim();
  // Loại bỏ ```json ... ``` hoặc ``` ... ``` (có thể có xuống dòng)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]?.trim()) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
  }
  // Fallback: tìm object/array JSON đầu tiên nếu vẫn còn ký tự lạ
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const objMatch = cleaned.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (objMatch) cleaned = objMatch[1];
  }
  return cleaned.trim();
}

// POST /api/ai/verify-avatar - Kiểm tra ảnh đại diện bằng AI (không cần auth)
router.post('/verify-avatar', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ isValid: false, reason: 'Thiếu dữ liệu ảnh' });

    const prompt = `Bạn là chuyên gia xác thực ảnh đại diện. Hãy phân tích ảnh được cung cấp và xác định xem đó có phải là ẢNH CHỤP NGƯỜI THẬT hay không.

⚠️ YÊU CẦU NGHIÊM NGẶT: Chỉ chấp nhận ẢNH CHỤP THẬT bằng máy ảnh/điện thoại của MỘT NGƯỜI duy nhất, có khuôn mặt rõ ràng.

✅ ĐƯỢC CHẤP NHẬN (isValid = true):
- Ảnh chụp thật bằng camera/điện thoại của một người (mọi lứa tuổi, giới tính, dân tộc)
- Ảnh selfie hoặc ảnh chân dung chụp từ máy ảnh thật
- Có thể nhìn rõ mặt người trong ảnh
- Background có thể là phông nền thật bất kỳ

❌ KHÔNG ĐƯỢC CHẤP NHẬN (isValid = false) nếu ẢNH thuộc MỘT trong các trường hợp sau:
1. 🎨 HOẠT HÌNH/ANIME/MANGA: Nhân vật hoạt hình, anime, manga, truyện tranh, game, hình vẽ
2. 🤖 AI GENERATED: Ảnh được tạo bởi AI/Deepfake, khuôn mặt không phải người thật
3. 🖼️ TRANH VẼ: Tranh vẽ tay, sketch, digital art, ảnh minh họa
4. 🌄 PHONG CẢNH/ĐỒ VẬT: Ảnh chụp phong cảnh, đồ vật, con vật, cây cối, nhà cửa
5. 🗿 TƯỢNG/MÔ HÌNH: Tượng sáp, mannequin, búp bê, tượng thạch cao
6. 👥 NHIỀU NGƯỜI: Ảnh group có từ 2 người trở lên
7. 🙈 KHUÔN MẶT MỜ/KHÔNG RÕ: Ảnh quá mờ, không thấy rõ khuôn mặt, chụp từ xa, chụp sau gáy
8. 🆔 ẢNH GIẤY TỜ: Ảnh chụp CMND/CCCD, passport, bằng lái xe
9. 📸 ẢNH NGƯỜI NỔI TIẾNG: Ảnh diễn viên, ca sĩ, người mẫu nổi tiếng rõ ràng không phải người dùng
10. 🎭 ẢNH CÓ FILTER QUÁ MỨC: Ảnh đã qua chỉnh sửa/lọc quá nhiều khiến không nhận dạng được người thật

Trả về JSON đúng format: { "isValid": boolean, "reason": "string" }
- reason: giải thích ngắn gọn bằng tiếng Việt (tối đa 120 ký tự). Nếu hợp lệ thì reason = "Ảnh người thật hợp lệ".`;

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isValid: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          }
        }
      }
    };
    const response = await callAI(requestId, 'verify', payload, { modelName: 'auto' });

    let result;
    try {
      result = JSON.parse(sanitizeJSON(response.text));
    } catch {
      console.warn(`[AvatarVerify] Request ${requestId}: Failed to parse AI response: ${response.text}`);
      result = { isValid: true, reason: 'Không thể xác thực, chấp nhận ảnh này.' };
    }

    console.log(`[AvatarVerify] Request ${requestId}: Result - isValid=${result.isValid}, reason=${result.reason}`);
    res.json(result);
  } catch (err: any) {
    console.error(`[AvatarVerify] Request ${requestId}: Error:`, err.message);
    res.json({ isValid: true, reason: 'Lỗi hệ thống xác thực, ảnh đã được chấp nhận.' });
  }
});

// Áp dụng optionalAuth cho tất cả AI routes
router.use(optionalAuth);

// POST /api/ai/extract - Trích xuất chỉ số từ ảnh
router.post('/extract', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  const startedAt = Date.now();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const userId = (req as any).user?.userId || 'anonymous';
    console.log(`[VisionExtract] 🚀 [${requestId}] Step 1: Received single-image extract request | user=${userId} | base64Len=${imageBase64.length} | selectedYear=${selectedYear || 'auto'}`);

    let prompt = `Phân tích ẢNH CHỤP KẾT QUẢ ĐO InBody/CÂN ĐIỆN TỬ hoặc PHIẾU ĐO CHỈ SỐ SỨC KHỎE này.
NGUYÊN TẮC ĐỌC CHÍNH XÁC:
1. Quan sát kỹ nhãn/tiêu đề của từng chỉ số trong ảnh để ánh xạ đúng vào trường tương ứng, không lấy nhầm giá trị của chỉ số khác:
   - weight: Cân nặng / Trọng lượng (kg)
   - bodyFat: Mỡ cơ thể / % Mỡ / Tỷ lệ mỡ (%)
   - muscleMass: Lượng cơ / Khối lượng cơ (kg)
   - waterPercent: Tỷ lệ nước / % Nước (%)
   - boneMinerals: Khoáng chất / Khối lượng xương (kg)
   - visceralFat: Mỡ nội tạng
   - energy: Năng lượng / Chuyển hóa cơ bản / BMR / Kcal
   - bioAge: Tuổi sinh học / Tuổi cơ thể
   - balanceIndex: Chỉ số cân đối / Vóc dáng
   - date: Ngày đo (YYYY-MM-DD)
2. Đọc đầy đủ cả phần nguyên và phần thập phân của từng con số (dấu phẩy ',' trong ảnh phải chuyển thành dấu chấm '.' trong JSON). Chỉ trích xuất các số liệu CÓ THỰC trong ảnh; nếu không thấy chỉ số nào thì để 0.
3. KHÔNG suy luận dài dòng, KHÔNG giải thích, chỉ trả về NGAY LẬP TỨC JSON object thuần túy với các trường số kiểu number.`;
    if (selectedYear) {
      prompt += `\nLưu ý: Nếu ngày đo không ghi rõ năm, hãy dùng năm ${selectedYear}.`;
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER }, muscleMass: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER }, visceralFat: { type: Type.NUMBER },
            energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER }, balanceIndex: { type: Type.NUMBER },
            date: { type: Type.STRING }
          }
        }
      }
    };
    console.log(`[VisionExtract] 🤖 [${requestId}] Step 2: Calling AI Router (task=vision, timeoutMs=60000, retries=1, reasoningEffort=none)...`);
    const response = await callAI(requestId, 'vision', payload, {
      userId,
      modelName: 'auto',
      timeoutMs: 60000,
      retries: 1,
      temperature: 0.1,
      reasoningEffort: 'none',
    });
    console.log(`[VisionExtract] 📥 [${requestId}] Step 3: AI responded in ${Date.now() - startedAt}ms | provider=${response.providerUsed} | model=${response.resolvedModel || response.modelUsed} | rawText=${response.text.slice(0, 300)}`);
    const sanitized = sanitizeJSON(response.text);
    const result = JSON.parse(sanitized);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('AI trả về dữ liệu chỉ số không đúng định dạng.');
    }
    console.log(`[VisionExtract] ✅ [${requestId}] Step 4: Completed in ${Date.now() - startedAt}ms | result=`, result);
    res.json(result);
  } catch (err: any) {
    console.error(`[VisionExtract] ❌ [${requestId}] Failed after ${Date.now() - startedAt}ms:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/bulk-extract
router.post('/bulk-extract', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  const startedAt = Date.now();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const userId = (req as any).user?.userId || 'anonymous';
    console.log(`[BulkExtract] 🚀 [${requestId}] Step 1: Received bulk-extract request | user=${userId} | base64Len=${imageBase64.length} (~${Math.round(imageBase64.length * 0.75 / 1024)}KB) | selectedYear=${selectedYear || 'auto'}`);

    let prompt = `Bạn là chuyên gia OCR đọc BẢNG GHI CHÉP TAY chỉ số sức khỏe. Hãy xem kỹ ảnh và trích xuất dữ liệu thành JSON.

QUY TRÌNH ĐỌC BẢNG CHÍNH XÁC:

BƯỚC 1 — ĐẾM VÀ ĐỌC TIÊU ĐỀ TỪNG CỘT TỪ TRÁI SANG PHẢI ("headerColumns"):
- Quan sát toàn bộ các đường kẻ dọc chia cột từ mép trái sang mép phải của bảng để đếm và nhận diện đầy đủ tất cả các cột trên bảng (kể cả các cột có bề ngang hẹp).
- Đọc chữ tiêu đề in ở đầu mỗi cột theo đúng thứ tự thực tế từ TRÁI sang PHẢI và ghi vào mảng "headerColumns" theo định dạng:
  "Cột <số_thứ_tự>: <chữ_tiêu_đề_trên_bảng> => <tên_trường>"
- Bảng ánh xạ giữa tiêu đề cột và tên trường (key):
  * Ngày / Ngày tháng / Thời gian => "date"
  * Cân nặng / Trọng lượng => "weight"
  * Mỡ cơ thể / % Mỡ / Tỷ lệ mỡ => "bodyFat"
  * % Nước / Tỷ lệ nước / Nước => "waterPercent"
  * Cơ / Lượng cơ / Khối lượng cơ => "muscleMass"
  * Vóc dáng / Cân đối / Chỉ số cân đối => "balanceIndex"
  * Khoáng chất / Xương / Khối xương / Canxi / Độ loãng xương => "boneMinerals"
  * Mỡ nội tạng / MNT / Nội tạng => "visceralFat"
  * Năng lượng / Kcal / BMR / Chuyển hóa cơ bản => "energy"
  * Tuổi sinh học / Tuổi SH / Tuổi cơ thể / Tuổi tế bào => "bioAge"

BƯỚC 2 — ĐỌC ĐẦY ĐỦ CÁC CHỈ SỐ THEO TỪNG CỘT TRÊN MỖI DÒNG ("rows"):
- Với mỗi dòng dữ liệu từ trên xuống dưới, hãy đọc đầy đủ các chỉ số theo từng cột từ TRÁI sang PHẢI, đảm bảo kiểm tra qua tất cả các cột đã liệt kê trong "headerColumns" mà không bỏ sót bất kỳ cột nào và không gộp hai cột liền kề làm một.
- Ở mỗi ô, gióng thẳng theo cột dọc lên tiêu đề ở đầu cột đó để gán đúng vào trường tương ứng; viết các trường trong mỗi dòng theo đúng thứ tự cột từ trái sang phải của "headerColumns" để các chỉ số không bị đẩy lệch sang cột kế bên.
- Đọc trọn vẹn tất cả các chữ số phần nguyên và phần thập phân trong mỗi ô (kể cả chữ số viết sát vạch kẻ dọc). Chuyển dấu phẩy thập phân (ví dụ "37,8") thành dấu chấm chuẩn trong JSON (37.8).
- Tất cả các chỉ số phải là kiểu NUMBER (không dùng string). weight PHẢI > 0. Ô nào thực sự để trống không ghi số liệu thì bỏ qua trường đó.
- Trường "date": Giữ nguyên thứ tự NGÀY/THÁNG (DD/MM) như trong bảng và gắn thêm năm thành DD/MM/YYYY.`;
    if (selectedYear) {
      prompt += `\n- Nếu ngày trong ảnh không ghi năm, dùng năm ${selectedYear} (ví dụ thấy "09/10" tức ngày 09 tháng 10 -> ghi "09/10/${selectedYear}").`;
    }
    prompt += `

ĐỊNH DẠNG ĐẦU RA (JSON Object thuần túy, KHÔNG giải thích):
{
  "headerColumns": [
    "Cột 1: <tiêu_đề_cột_1> => date",
    "Cột 2: <tiêu_đề_cột_2> => <tên_trường_cột_2>",
    "...liệt kê đầy đủ tất cả các cột từ trái sang phải trên bảng"
  ],
  "rows": [
    { "date": "DD/MM/YYYY", "<tên_trường_theo_đúng_thứ_tự_từng_cột_trong_headerColumns>": <giá_trị_số> }
  ]
}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headerColumns: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            rows: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING }, weight: { type: Type.NUMBER }, bodyFat: { type: Type.NUMBER },
                  muscleMass: { type: Type.NUMBER }, waterPercent: { type: Type.NUMBER }, boneMinerals: { type: Type.NUMBER },
                  visceralFat: { type: Type.NUMBER }, energy: { type: Type.NUMBER }, bioAge: { type: Type.NUMBER },
                  balanceIndex: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    };
    console.log(`[BulkExtract] 🤖 [${requestId}] Step 2: Calling AI Router (task=vision, timeoutMs=90000, retries=0, temp=0.1, reasoningEffort=none)...`);
    const response = await callAI(requestId, 'vision', payload, {
      userId,
      modelName: 'auto',
      timeoutMs: 90000,
      retries: 0,
      temperature: 0.1,
      reasoningEffort: 'none',
    });
    console.log(`[BulkExtract] 📥 [${requestId}] Step 3: AI responded in ${Date.now() - startedAt}ms | provider=${response.providerUsed} | model=${response.resolvedModel || response.modelUsed} | rawLen=${response.text.length} | preview=${response.text.slice(0, 300)}`);
    const sanitized = sanitizeJSON(response.text);
    let parsed: any;
    try {
      parsed = JSON.parse(sanitized);
    } catch (parseErr: any) {
      console.error(`[BulkExtract] ❌ [${requestId}] Step 4: JSON.parse failed on sanitized text:`, sanitized.slice(0, 500));
      throw new Error(`Không thể đọc JSON từ phản hồi AI: ${parseErr.message}`);
    }
    const headerColumns = Array.isArray(parsed?.headerColumns) ? parsed.headerColumns : null;
    if (headerColumns) {
      console.log(`[BulkExtract] 📋 [${requestId}] Step 4a: Detected table header columns (left-to-right):`, headerColumns.join(' | '));
      try {
        res.setHeader('X-AI-Header-Columns', encodeURIComponent(JSON.stringify(headerColumns)));
      } catch {}
    }
    const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.rows) ? parsed.rows : null);
    if (!Array.isArray(rows)) {
      console.error(`[BulkExtract] ❌ [${requestId}] Step 4b: Parsed JSON does not contain a valid rows array:`, typeof parsed);
      throw new Error('AI trả về danh sách chỉ số không đúng định dạng mảng.');
    }
    console.log(`[BulkExtract] ✅ [${requestId}] Step 5: Completed in ${Date.now() - startedAt}ms with ${rows.length} rows`);
    res.json(rows);
  } catch (err: any) {
    console.error(`[BulkExtract] ❌ [${requestId}] Failed after ${Date.now() - startedAt}ms:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/analyze-food - Phân tích ảnh thức ăn & đưa ra khuyến cáo dinh dưỡng
router.post('/analyze-food', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: "Vui lòng đăng nhập để sử dụng tính năng này" });

    console.log(`\n[FoodAnalysis] 🍽️ [${requestId}] User ${userId} gửi yêu cầu phân tích ảnh thức ăn`);

    // Dynamic import để tránh circular dependency
    const { analyzeMeal } = await import('../services/foodAnalysisService.ts');
    const result = await analyzeMeal(requestId, imageBase64, userId);

    console.log(`[FoodAnalysis] ✅ [${requestId}] Hoàn tất phân tích: ${result.mealAnalysis.foods.length} món, ${result.mealAnalysis.totalCalories}kcal`);
    console.log(`[FoodAnalysis] 📝 [${requestId}] Khuyến cáo: ${result.recommendation?.substring(0, 100)}`);

    res.json(result);
  } catch (err: any) {
    console.error(`[FoodAnalysis] ❌ [${requestId}] Error:`, err.message);
    res.status(500).json({
      message: err.message,
      mealAnalysis: { foods: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, totalFiber: 0, mealType: 'unknown', analysisConfidence: 'low', description: 'Lỗi hệ thống phân tích' },
      userContext: { hasMetrics: false, dailyCalorieTarget: 0, macrosTarget: { protein: 0, carbs: 0, fat: 0 }, goals: [], bmi: null },
      mealAssessment: { caloriePercentage: 0, proteinPercentage: 0, carbsPercentage: 0, fatPercentage: 0, isBalanced: false, assessment: 'Lỗi hệ thống' },
      recommendation: 'Rất tiếc, hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
      suggestedAdjustments: [],
      suggestedMenu: ''
    });
  }
});

// POST /api/ai/suggest-meal - Gợi ý thực đơn dựa trên mục tiêu người dùng
router.post('/suggest-meal', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { mealType, calorieTarget, dietaryPreference } = req.body;
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: "Vui lòng đăng nhập để sử dụng tính năng này" });

    console.log(`\n[SuggestMeal] 📋 [${requestId}] User ${userId} yêu cầu gợi ý thực đơn (${mealType || 'mặc định'})`);

    const { suggestMeal } = await import('../services/foodAnalysisService.ts');
    const result = await suggestMeal(requestId, userId, {
      mealType: mealType || undefined,
      calorieTarget: calorieTarget ? Number(calorieTarget) : undefined,
      dietaryPreference: dietaryPreference || undefined
    });

    console.log(`[SuggestMeal] ✅ [${requestId}] Đã gợi ý thực đơn cho user ${userId}`);

    res.json(result);
  } catch (err: any) {
    console.error(`[SuggestMeal] ❌ [${requestId}] Error:`, err.message);
    res.status(500).json({
      mealSuggestions: 'Rất tiếc, không thể tạo gợi ý thực đơn lúc này. Vui lòng thử lại sau.',
      basedOn: ''
    });
  }
});

// POST /api/ai/coach
router.post('/coach', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64, autoContext } = req.body;
    const userId = (req as any).user?.userId || 'anonymous';

    let finalSystemInstruction = systemInstruction;
    let finalPayload: any;

    if (autoContext && userId !== 'anonymous') {
      // Tự động build system prompt từ chatContextService
      const { buildChatSystemContext } = await import('../services/ai/index.ts');
      const contextResult = await buildChatSystemContext(userId, latestUserMessage);
      finalSystemInstruction = contextResult.systemPrompt;
    }

    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });

    finalPayload = { contents: [...(history || []), { role: 'user', parts }], config: { systemInstruction: finalSystemInstruction } };

    // Xác định task type dựa vào có ảnh hay không
    const taskType: AITaskType = imageBase64 ? 'vision' : 'coach';

    const response = await callAI(requestId, taskType, finalPayload, { userId, modelName: 'auto' });
    res.json({ text: response.text });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;