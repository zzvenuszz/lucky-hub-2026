
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED'))) {
      if (window.debugLog) window.debugLog(`Đang thử lại do nghẽn mạng (còn ${retries} lần)...`, "info");
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const extractMetricsFromImage = async (base64Image: string): Promise<Partial<HealthMetric>> => {
  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[Gemini OCR] ${msg}`, type);
  };

  const currentYear = new Date().getFullYear();
  log("Bắt đầu trích xuất chỉ số (9 chỉ số)...");
  
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: `Phân tích ảnh InBody. TRÍCH XUẤT 9 CHỈ SỐ: 
          1. weight (Cân nặng)
          2. bodyFat (% Mỡ)
          3. muscleMass (Khối cơ)
          4. visceralFat (Mỡ nội tạng)
          5. boneMinerals (Khối lượng xương)
          6. waterPercent (% Nước)
          7. energy (BMR/Kcal)
          8. bioAge (Tuổi cơ thể)
          9. balanceIndex (Chỉ số cân đối - Thường ghi là Balance/Body Balance. NẾU KHÔNG CÓ TRẢ VỀ 0).
          
          VỀ NGÀY THÁNG: Nếu thấy DD/MM hoặc DD-MM, hãy tự hiểu là năm ${currentYear} và trả về YYYY-MM-DD.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING },
            weight: { type: Type.NUMBER },
            bodyFat: { type: Type.NUMBER },
            boneMinerals: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER },
            muscleMass: { type: Type.NUMBER },
            balanceIndex: { type: Type.NUMBER },
            energy: { type: Type.NUMBER },
            bioAge: { type: Type.NUMBER },
            visceralFat: { type: Type.NUMBER }
          },
          required: ["weight", "bodyFat"]
        }
      }
    });

    const result = JSON.parse(cleanJsonResponse(response.text || "{}"));
    
    // Đảm bảo balanceIndex luôn có giá trị
    result.balanceIndex = result.balanceIndex || 0;

    // Hậu xử lý ngày tháng
    if (result.date) {
      const parts = result.date.split(/[-/]/);
      if (parts.length === 2) {
        result.date = `${currentYear}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else if (parts.length === 3) {
        let y = parts[0], m = parts[1], d = parts[2];
        if (y.length < 4) { y = parts[2]; d = parts[0]; }
        result.date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    } else {
      result.date = new Date().toISOString().split('T')[0];
    }

    log(`Kết quả: ${result.weight}kg - Cân đối: ${result.balanceIndex} - Ngày: ${result.date}`, "success");
    return result;
  }).catch(e => {
    log(`LỖI: ${e.message}`, "error");
    return { balanceIndex: 0, date: new Date().toISOString().split('T')[0] };
  });
};

export const getAICoachResponse = async (
  history: Message[], 
  knowledge: AIKnowledge[], 
  rules: AIRule[],
  latestUserMessage: string,
  userGoal: HealthGoal,
  latestMetric?: HealthMetric,
  base64Image?: string
): Promise<string | null> => {
  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[Gemini Coach] ${msg}`, type);
  };

  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");
    const contextKnowledge = knowledge
      .filter(k => latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()))
      .map(k => `- ${k.keyword}: ${k.content}`).join("\n");

    const systemInstruction = `Bạn là "🍀Trợ lý Lucky". Mục tiêu hội viên: ${userGoal}.
Chỉ số mới nhất: ${latestMetric ? `Cân ${latestMetric.weight}kg, Mỡ ${latestMetric.bodyFat}%, Cơ ${latestMetric.muscleMass}kg, Cân đối: ${latestMetric.balanceIndex}` : "Chưa có dữ liệu"}.

QUY TẮC:
${systemRules}

KIẾN THỨC:
${contextKnowledge}

PHONG CÁCH:
- Bạn là một trợ lý sức khỏe thông minh, chuyên nghiệp và tận tâm.
- Trả lời ngắn gọn, đi thẳng vào vấn đề kiến thức.
- Nếu bạn tham gia vào cuộc hội thoại giữa 2 người, hãy đóng vai trò là chuyên gia tư vấn trung lập cung cấp dữ liệu khoa học.`;

    const formattedHistory = history.slice(-6).map(m => ({
      role: (m.senderId === 'ai_coach' || m.senderRole === 'AI') ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [...formattedHistory, { role: 'user', parts: base64Image ? [{ text: latestUserMessage || "Phân tích ảnh" }, { inlineData: { mimeType: 'image/jpeg', data: base64Image } }] : [{ text: latestUserMessage }] }],
      config: { systemInstruction, temperature: 0.7 }
    });

    return response.text;
  }).catch(() => "Xin lỗi, tôi đang bận một chút.");
};
