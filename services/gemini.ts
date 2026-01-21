
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

export const extractMetricsFromImage = async (base64Image: string): Promise<Partial<HealthMetric>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Trích xuất các chỉ số sức khỏe từ ảnh chụp và trả về JSON chuẩn." }
        ]
      }],
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
          }
        }
      }
    });
    return JSON.parse(cleanJsonResponse(response.text || "{}"));
  } catch (e) {
    console.error("Lỗi trích xuất ảnh:", e);
    return {};
  }
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
  const log = (msg: string, type: string = 'info') => {
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Kiểm tra độ mới của dữ liệu (3 ngày)
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

  const metricText = latestMetric ? `
DỮ LIỆU CƠ THỂ THỰC TẾ (Đo ngày ${latestMetric.date}):
- Cân nặng: ${latestMetric.weight}kg
- Tỉ lệ mỡ: ${latestMetric.bodyFat}%
- Khối lượng cơ: ${latestMetric.muscleMass}kg
- Mỡ nội tạng: Level ${latestMetric.visceralFat}
- Tuổi sinh học: ${latestMetric.bioAge} tuổi
${isDataOld ? `(⚠️ CẢNH BÁO: Dữ liệu này đã cũ - ${daysOld} ngày. Bạn phải nhắc hội viên cập nhật lại chỉ số)` : "(Dữ liệu còn mới, hãy tư vấn dựa trên thông số này)"}
  ` : "Hội viên này chưa có dữ liệu đo lường. Hãy yêu cầu họ đo InBody ngay.";

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe tại Lucky Hub.

THÔNG TIN HỘI VIÊN ĐANG CHAT:
- Mục tiêu thực tế: ${userGoal}
${metricText}

NHIỆM VỤ CỦA BẠN:
1. Đọc kỹ Cân nặng, Mỡ, Cơ ở trên để đưa ra lời khuyên. 
2. Nếu có ảnh bữa ăn, hãy phân tích xem nó giúp hay hại cho mục tiêu "${userGoal}" và các chỉ số hiện tại.
3. Nếu dữ liệu cũ > 3 ngày, BẮT BUỘC phải nhắc hội viên cập nhật chỉ số ở cuối câu trả lời.

QUY TẮC CHUYÊN MÔN:
${systemRules}
${contextKnowledge}

PHONG CÁCH: Chân thành, chuyên nghiệp, dùng Emoji.`;

  // Xây dựng contents chuẩn để tránh lỗi Mixing Content and Parts
  const contents = [
    ...history.slice(-6).map(m => ({
      role: m.senderId === 'ai_coach' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    {
      role: 'user',
      parts: [
        { text: latestUserMessage || "Phân tích giúp tôi" },
        ...(base64Image ? [{ inlineData: { mimeType: 'image/jpeg', data: base64Image } }] : [])
      ]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents,
      config: { systemInstruction, temperature: 0.7 }
    });

    if (response.text) {
      log(`AI đã trả lời dựa trên mục tiêu: ${userGoal}`, "success");
      return response.text;
    }
  } catch (e: any) {
    log(`Lỗi API: ${e.message}`, "error");
  }

  return "Xin lỗi, tôi đang gặp khó khăn khi truy cập dữ liệu. Bạn hãy thử lại nhé!";
};
