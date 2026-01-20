
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge, AIRule } from "../types.ts";

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
  rules: AIRule[],
  latestUserMessage: string
): Promise<string | null> => {
  const log = (msg: string, type: string = 'info') => {
    if (window.debugLog) window.debugLog(`[GeminiService] ${msg}`, type);
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  log("Bắt đầu chuẩn bị dữ liệu gửi tới Gemini...", "system");

  // Lọc kiến thức liên quan
  const contextKnowledge = knowledge
    .filter(k => 
      latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
      k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
    )
    .map(k => `- ${k.keyword}: ${k.content}`)
    .join("\n");

  if (contextKnowledge) log(`Đã tìm thấy ${contextKnowledge.split('\n').length} kiến thức liên quan.`, "success");
  else log("Không tìm thấy kiến thức đặc thù, sử dụng kiến thức chung.", "info");

  // Tổng hợp quy tắc
  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");
  log(`Áp dụng ${rules.length} tiêu chuẩn giao tiếp.`, "info");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe thông minh tại Lucky Hub.
  
  NHIỆM VỤ CỦA BẠN:
  1. Hỗ trợ Huấn luyện viên (Coach) giải đáp thắc mắc của Hội viên.
  2. ƯU TIÊN KIẾN THỨC ĐÃ ĐƯỢC TRAIN:
  ${contextKnowledge || "Sử dụng kiến thức y khoa và dinh dưỡng khoa học hiện đại."}
  
  TIÊU CHUẨN GIAO TIẾP (BẮT BUỘC TUÂN THỦ):
  ${systemRules || "- Phải thân thiện và chuyên nghiệp.\n- Trả lời bằng tiếng Việt.\n- Không bịa đặt thông tin."}
  
  NGUYÊN TẮC PHẢN HỒI:
  - Ngắn gọn (dưới 100 chữ).
  - Nếu không biết chắc chắn, hãy khuyên hội viên chờ HLV con người phản hồi.
  - Không tự ý đưa ra phác đồ điều trị y tế thay thế bác sĩ.`;

  try {
    log("Đang gọi API gemini-3-pro-preview...", "system");
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

    const result = response.text;
    if (result) {
      log("Nhận phản hồi từ AI thành công.", "success");
      return result;
    } else {
      log("AI trả về phản hồi rỗng.", "error");
      return "Lucky AI đang bận một chút, HLV của bạn sẽ phản hồi sớm nhé!";
    }
  } catch (e: any) {
    const errorMsg = e.message || "Lỗi không xác định";
    log(`Lỗi Gemini API: ${errorMsg}`, "error");
    console.error("Gemini AI Error:", e);
    return `[LỖI HỆ THỐNG]: ${errorMsg}. Vui lòng kiểm tra API Key và kết nối mạng.`;
  }
};
