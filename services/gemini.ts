
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge } from "../types.ts";

/**
 * Hàm hỗ trợ để làm sạch chuỗi JSON từ phản hồi của AI.
 */
const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    return match[0];
  }
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
          { text: "Bạn là một AI chuyên trích xuất dữ liệu y tế từ ảnh chụp cân điện tử hoặc bảng ghi tay. Hãy trích xuất các chỉ số sau và trả về định dạng JSON: date (YYYY-MM-DD), weight (kg), bodyFat (%), boneMinerals (kg), waterPercent (%), muscleMass (kg), balanceIndex, energy (kcal), bioAge, visceralFat. Nếu không thấy chỉ số nào, hãy để null." }
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

    const text = response.text || "{}";
    const cleanedText = cleanJsonResponse(text);
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("Lỗi khi trích xuất chỉ số từ ảnh:", e);
    return {};
  }
};

export const getAICoachResponse = async (
  history: Message[], 
  knowledge: AIKnowledge[], 
  latestUserMessage: string
): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const relevantKnowledge = knowledge
    .filter(k => latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()))
    .map(k => k.content)
    .join("\n");

  if (!relevantKnowledge && latestUserMessage.length < 10) return null;

  const systemPrompt = `Bạn là một Huấn Luyện Viên AI (AI Coach) đóng vai trò cố vấn tại Lucky Hub.
  Bạn đang tham gia cuộc trò chuyện giữa Hội viên và Huấn luyện viên con người.
  Nhiệm vụ của bạn:
  1. Theo dõi lịch sử trò chuyện.
  2. Chỉ trả lời nếu bạn có kiến thức liên quan hoặc người dùng đang hỏi về sức khỏe.
  3. Nếu không có kiến thức chuyên sâu, hãy khuyên họ đợi phản hồi từ HLV chính.
  4. Kiến thức cấu hình sẵn của bạn: ${relevantKnowledge || "Hãy tư vấn dựa trên kiến thức sức khỏe chung một cách khoa học."}
  
  Hãy trả lời ngắn gọn, chuyên nghiệp, lịch sự.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: history.map(m => `${m.senderName} (${m.senderRole}): ${m.content}`).join("\n") + `\nThành viên mới nhắn: ${latestUserMessage}`,
      config: { systemInstruction: systemPrompt }
    });

    return response.text || "Tôi đang nghiên cứu thêm về vấn đề này, HLV của bạn sẽ sớm phản hồi.";
  } catch (e) {
    console.error("Lỗi khi gọi AI Coach:", e);
    return "Xin lỗi, tôi đang gặp chút vấn đề kỹ thuật. HLV của bạn sẽ hỗ trợ bạn ngay.";
  }
};
