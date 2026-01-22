
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
  log("Bắt đầu trích xuất chỉ số (Thông minh)...");
  
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: `Phân tích ảnh InBody. TRÍCH XUẤT: Cân nặng, % Mỡ, Khối cơ, Mỡ nội tạng, Tuổi cơ thể, % Nước, Xương, BMR. 
          QUAN TRỌNG VỀ NGÀY THÁNG: 
          1. Tìm ngày đo trên phiếu (thường ở góc trên hoặc dưới). 
          2. Nếu ngày ghi dạng DD/MM (VD: 15/03 hoặc 15-03), hãy tự động hiểu là năm ${currentYear} (VD: 15/03/${currentYear}).
          3. TRẢ VỀ kết quả trường 'date' theo định dạng chuỗi YYYY-MM-DD. 
          Nếu hoàn toàn không thấy ngày, hãy để trống trường date.` }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Format: YYYY-MM-DD" },
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
    
    // Hậu xử lý ngày tháng nâng cao
    if (result.date) {
      const parts = result.date.split(/[-/]/);
      if (parts.length === 2) {
        // Trường hợp AI trả về DD-MM hoặc MM-DD
        // Giả định định dạng phổ biến là DD-MM
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        result.date = `${currentYear}-${month}-${day}`;
      } else if (parts.length === 3) {
        // Đảm bảo định dạng YYYY-MM-DD
        let y = parts[0], m = parts[1], d = parts[2];
        if (y.length < 4) { // Nếu trả về DD-MM-YYYY
            y = parts[2]; d = parts[0];
        }
        result.date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    } else {
      result.date = new Date().toISOString().split('T')[0];
    }

    log(`Kết quả AI: ${result.weight}kg - Ngày nhận diện: ${result.date}`, "success");
    return result;
  }).catch(e => {
    log(`LỖI PHÂN TÍCH: ${e.message}`, "error");
    return { date: new Date().toISOString().split('T')[0] };
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
