import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { optionalAuth } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { callAI, callAIWithRetry, AITaskType, getActiveProvider, getProviderLabel } from '../services/aiService.ts';
import { Type } from "@google/genai";

const router = Router();

/**
 * Sanitize response text từ AI: loại bỏ markdown code block (```json ... ```)
 * để đảm bảo JSON.parse không bị lỗi
 */
function sanitizeJSON(text: string): string {
  if (!text) return text;
  let cleaned = text.trim();
  // Loại bỏ ```json ... ``` hoặc ``` ... ``` (có thể có xuống dòng)
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  // Fallback: tìm object/array JSON đầu tiên nếu vẫn còn ký tự lạ
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const objMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
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
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const userId = (req as any).user?.userId || 'anonymous';

    let prompt = `Phân tích ẢNH CHỤP KẾT QUẢ ĐO InBody/CÂN ĐIỆN TỬ này.
QUAN TRỌNG: Chỉ trích xuất các số liệu CÓ THỰC trong ảnh. Nếu không thấy số liệu nào, để mặc định 0.
YÊU CẦU ĐỊNH DẠNG: Trả về JSON object với các trường là số (number), không phải chuỗi (string).
- weight (kg, số thực > 0): Cân nặng
- bodyFat (%, số thực): Mỡ cơ thể
- muscleMass (kg, số thực): Lượng cơ
- waterPercent (%, số thực): Tỷ lệ nước
- boneMinerals (kg, số thực): Khoáng chất
- visceralFat (số nguyên): Mỡ nội tạng
- energy (kcal, số nguyên): Năng lượng
- bioAge (số nguyên): Tuổi sinh học
- balanceIndex (số nguyên): Cân đối
- date (YYYY-MM-DD): Ngày đo`;
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
    const response = await callAI(requestId, 'vision', payload, { userId, modelName: 'auto' });
    res.json(JSON.parse(sanitizeJSON(response.text)));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/bulk-extract
router.post('/bulk-extract', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    const userId = (req as any).user?.userId || 'anonymous';

    let prompt = `Bạn là chuyên gia đọc BẢNG GHI CHÉP TAY chỉ số sức khỏe.
Hãy xem ảnh và trích xuất DANH SÁCH các dòng dữ liệu thành JSON array.
Mỗi dòng là một ngày đo lường với các thông số.

YÊU CẦU ĐỊNH DẠNG NGHIÊM NGẶT - Trả về JSON array, mỗi phần tử là object:
{ "date": "YYYY-MM-DD", "weight": 65.5, "bodyFat": 18.5, "muscleMass": 48.0, "waterPercent": 60.0, "boneMinerals": 2.5, "visceralFat": 8, "energy": 1500, "bioAge": 30, "balanceIndex": 80 }

QUAN TRỌNG:
- Tất cả số liệu phải là kiểu NUMBER (không phải string). Ví dụ: "weight": 65.5, KHÔNG phải "weight": "65.5"
- weight (cân nặng) PHẢI > 0 cho mỗi dòng hợp lệ
- Nếu không nhìn thấy giá trị cho trường nào, hãy để null hoặc bỏ qua trường đó
- date: Nếu thấy ngày dạng DD/MM thì chuyển thành YYYY-MM-DD
- Nếu không thấy ngày, để ngày hiện tại`;
    if (selectedYear) {
      prompt += `\nRẤT QUAN TRỌNG VỀ NĂM: Nếu ngày trong ảnh không ghi rõ năm, hãy sử dụng năm ${selectedYear} (ví dụ: thấy "10/05" → "10/05/${selectedYear}").`;
    }

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
    };
    const response = await callAI(requestId, 'vision', payload, { userId, modelName: 'auto' });
    const sanitized = sanitizeJSON(response.text);
    console.log(`[BulkExtract] Request ${requestId}: Raw AI response (600 chars):`, sanitized.substring(0, 600));
    const parsed = JSON.parse(sanitized);
    console.log(`[BulkExtract] Request ${requestId}: Parsed ${parsed.length} items, sample:`, JSON.stringify(parsed[0] || null));
    res.json(parsed);
  } catch (err: any) {
    console.error(`[BulkExtract] Request ${requestId}: Error:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/coach
router.post('/coach', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const userId = (req as any).user?.userId || 'anonymous';
    
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    
    const payload = { contents: [...history, { role: 'user', parts }], config: { systemInstruction } };
    
    // Xác định task type dựa vào có ảnh hay không
    const taskType: AITaskType = imageBase64 ? 'vision' : 'coach';
    
    const response = await callAI(requestId, taskType, payload, { userId, modelName: 'auto' });
    res.json({ text: response.text });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
