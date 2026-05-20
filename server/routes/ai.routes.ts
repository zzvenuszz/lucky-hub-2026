import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.ts';
import { requirePermission } from '../middleware/requirePermission.ts';
import { RESOURCES } from '../config/permissions.ts';
import { callAIWithRetry } from '../services/aiService.ts';
import { Type } from "@google/genai";

const router = Router();
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