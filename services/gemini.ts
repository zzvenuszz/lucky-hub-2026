
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge } from "../types.ts";

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
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Trích xuất các chỉ số sức khỏe từ ảnh chụp và trả về JSON chuẩn." }
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
  latestUserMessage: string
): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Lọc kiến thức thực sự liên quan dựa trên ngữ cảnh
  const contextKnowledge = knowledge
    .filter(k => 
      latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
      k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
    )
    .map(k => `- ${k.keyword}: ${k.content}`)
    .join("\n");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe thông minh tại Lucky Hub.
  
  NHIỆM VỤ CỦA BẠN:
  1. Hỗ trợ Huấn luyện viên (Coach) giải đáp thắc mắc của Hội viên.
  2. ƯU TIÊN KIẾN THỨC ĐÃ ĐƯỢC TRAIN: Nếu câu hỏi nằm trong danh sách dưới đây, hãy trả lời bám sát nội dung đó.
  3. KIẾN THỨC ĐÃ ĐƯỢC HUẤN LUYỆN TỪ HỆ THỐNG:
  ${contextKnowledge || "Sử dụng kiến thức y khoa và dinh dưỡng khoa học hiện đại."}
  
  NGUYÊN TẮC PHẢN HỒI:
  - Trả lời bằng tiếng Việt, giọng văn chuyên nghiệp, ấm áp, khuyến khích.
  - Ngắn gọn (dưới 100 chữ).
  - Nếu không biết chắc chắn, hãy khuyên hội viên chờ HLV con người phản hồi chính xác nhất.
  - Không tự ý đưa ra phác đồ điều trị y tế thay thế bác sĩ.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { text: `Lịch sử chat:\n${history.slice(-5).map(m => `${m.senderName}: ${m.content}`).join("\n")}` },
        { text: `Câu hỏi mới nhất: ${latestUserMessage}` }
      ],
      config: { 
        systemInstruction,
        temperature: 0.7,
        topP: 0.95
      }
    });

    return response.text || "Lucky AI đang bận một chút, HLV của bạn sẽ phản hồi sớm nhé!";
  } catch (e) {
    console.error("Gemini AI Error:", e);
    return null;
  }
};
