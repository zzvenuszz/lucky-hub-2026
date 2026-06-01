import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { optionalAuth } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { callAI, callAIWithRetry, AITaskType, getActiveProvider, getProviderLabel } from '../services/aiService.ts';
import { Type } from "@google/genai";

const router = Router();

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
      result = JSON.parse(response.text);
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
    const response = await callAI(requestId, 'vision', payload, { userId, modelName: 'auto' });
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

    const userId = (req as any).user?.userId || 'anonymous';

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
    const response = await callAI(requestId, 'vision', payload, { userId, modelName: 'auto' });
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
