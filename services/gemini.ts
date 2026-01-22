
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

  log("Bắt đầu trích xuất chỉ số (Mobile-Optimized)...");
  
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Hãy phân tích hình ảnh kết quả đo InBody này (ảnh có thể bị xoay hoặc lóa). TRÍCH XUẤT tất cả các chỉ số sau: Cân nặng (Weight), Tỉ lệ mỡ (PBF/Body Fat %), Khối cơ (SMM/Muscle Mass), Mỡ nội tạng (VFL/Visceral Fat), Tuổi cơ thể (Body Age), Lượng nước (TBW/Water %), Xương (Mineral/Bone). Nếu một chỉ số không rõ, hãy để trống hoặc dùng giá trị mặc định 0. Trả về JSON chuẩn duy nhất." }
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

    const text = response.text;
    const result = JSON.parse(cleanJsonResponse(text || "{}"));
    log(`Kết quả: ${result.weight}kg / ${result.bodyFat}% mỡ`, "success");
    return result;
  }).catch(e => {
    log(`LỖI PHÂN TÍCH: ${e.message}`, "error");
    return {};
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
    
    let isDataOld = false;
    let daysOld = 0;
    if (latestMetric) {
      const lastDate = new Date(latestMetric.date);
      const now = new Date();
      lastDate.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      const diffTime = Math.abs(now.getTime() - lastDate.getTime());
      daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      isDataOld = daysOld > 3;
    }

    const contextKnowledge = knowledge
      .filter(k => latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()))
      .map(k => `- ${k.keyword}: ${k.content}`).join("\n");

    const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

    const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe Lucky Hub. 
Mục tiêu hội viên: ${userGoal}
Chỉ số mới nhất: ${latestMetric ? `Cân ${latestMetric.weight}kg, Mỡ ${latestMetric.bodyFat}%, Cơ ${latestMetric.muscleMass}kg` : "Chưa có dữ liệu"}.
${isDataOld ? `⚠️ Dữ liệu này đã ${daysOld} ngày, hãy nhắc hội viên cập nhật chỉ số mới.` : ""}

QUY TẮC CỐ ĐỊNH:
${systemRules}

KIẾN THỨC BỔ TRỢ:
${contextKnowledge}

PHONG CÁCH: Chân thành, chuyên môn cao nhưng dễ hiểu, dùng Emoji tinh tế.`;

    const formattedHistory = [];
    let lastRole = "";
    const relevantHistory = history.slice(-6);
    for (const m of relevantHistory) {
      const currentRole = m.senderId === 'ai_coach' ? 'model' : 'user';
      if (currentRole !== lastRole && m.content.trim()) {
        formattedHistory.push({ role: currentRole, parts: [{ text: m.content }] });
        lastRole = currentRole;
      }
    }

    const currentTurn = {
      role: 'user',
      parts: base64Image ? [{ text: latestUserMessage || "Phân tích ảnh này" }, { inlineData: { mimeType: 'image/jpeg', data: base64Image } }] : [{ text: latestUserMessage }]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [...formattedHistory, currentTurn],
      config: { systemInstruction, temperature: 0.7 }
    });

    return response.text || "Xin lỗi, tôi đang bận một chút. Bạn thử lại nhé!";
  }).catch(e => {
    log(`LỖI AI: ${e.message}`, "error");
    return "Hệ thống AI đang bảo trì, vui lòng quay lại sau ít phút.";
  });
};
