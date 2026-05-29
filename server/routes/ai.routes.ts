import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { callAIWithRetry } from '../services/aiService.ts';
import { Type } from "@google/genai";

const router = Router();

// POST /api/ai/verify-avatar - Kiểm tra ảnh đại diện bằng AI (không cần auth)
// Xác định ảnh có phải người thật hay không
router.post('/verify-avatar', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ isValid: false, reason: 'Thiếu dữ liệu ảnh' });

    const prompt = `You are an AI avatar validator. Analyze the given image and determine if it is a REAL HUMAN PHOTO (a photograph of an actual human person).
    
Rules:
- isValid = true: The image is a real photo of a human person (can be any age, any gender, any ethnicity)
- isValid = false if ANY of these apply:
  * Cartoon, anime, manga, or illustrated character
  * AI-generated/synthetic human face (not a real person)
  * Drawing, painting, sketch, or digital art
  * Animal, object, landscape, or any non-human subject
  * Meme, composite image, or edited fiction character
  * Statue, mannequin, doll, or wax figure
  * Celebrity/public figure photo that is clearly not the user themselves (e.g. a famous actor photo used as avatar)

Return JSON strictly with this format: { "isValid": boolean, "reason": "short explanation in Vietnamese" }
reason must be a short Vietnamese string explaining why (max 100 chars).`;

    console.log(`[AvatarVerify] Request ${requestId}: Verifying avatar...`);

    const payload = {
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] }],
    };
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);

    let result;
    try {
      result = JSON.parse(response.text);
    } catch {
      // Nếu AI không trả về JSON hợp lệ, fallback
      console.warn(`[AvatarVerify] Request ${requestId}: Failed to parse AI response: ${response.text}`);
      result = { isValid: true, reason: 'Không thể xác thực, chấp nhận ảnh này.' };
    }

    console.log(`[AvatarVerify] Request ${requestId}: Result - isValid=${result.isValid}, reason=${result.reason}`);
    res.json(result);
  } catch (err: any) {
    console.error(`[AvatarVerify] Request ${requestId}: Error:`, err.message);
    // Fallback: nếu lỗi thì cho phép ảnh (không block user vì lỗi hệ thống)
    res.json({ isValid: true, reason: 'Lỗi hệ thống xác thực, ảnh đã được chấp nhận.' });
  }
});

router.use(authMiddleware);
// POST /api/ai/extract - Trích xuất chỉ số từ ảnh
router.post('/extract', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { imageBase64, selectedYear } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "Thiếu dữ liệu ảnh" });

    let prompt = "Phân tích ảnh kết quả đo chỉ số InBody hoặc cân điện tử này. Trích xuất chính xác các số liệu. Nếu không thấy số liệu, hãy để là 0. Trả về JSON.";
    if (selectedYear) {
      prompt += ` Lưu ý: Nếu ngày đo không ghi rõ năm, hãy sử dụng năm ${selectedYear} cho kết quả (định dạng YYYY-MM-DD).`;
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
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json(JSON.parse(response.text));
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
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json(JSON.parse(response.text));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/ai/coach
router.post('/coach', async (req: Request, res: Response) => {
  const requestId = Math.random().toString(36).substring(7).toUpperCase();
  try {
    const { history, systemInstruction, latestUserMessage, imageBase64 } = req.body;
    const parts: any[] = [{ text: latestUserMessage }];
    if (imageBase64) parts.push({ inlineData: { data: imageBase64, mimeType: 'image/jpeg' } });
    const payload = { contents: [...history, { role: 'user', parts }], config: { systemInstruction } };
    const response = await callAIWithRetry(requestId, 'gemini-1.5-flash', payload);
    res.json({ text: response.text });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;