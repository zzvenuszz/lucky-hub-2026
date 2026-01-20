
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
    // Gửi sự kiện để AdminPanel có thể bắt được log nếu cần
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
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

  if (contextKnowledge) log(`Đã tìm thấy kiến thức liên quan cho từ khóa: ${contextKnowledge.split('\n').map(l => l.split(':')[0]).join(', ')}`, "success");
  else log("Không tìm thấy kiến thức huấn luyện đặc thù, AI sẽ trả lời dựa trên dữ liệu y khoa chuẩn.", "info");

  // Tổng hợp quy tắc
  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");
  log(`Đang áp dụng ${rules.length} quy tắc tuân thủ giao tiếp.`, "info");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe thông minh tại Lucky Hub.
  
  NHIỆM VỤ CỦA BẠN:
  1. Hỗ trợ Huấn luyện viên (Coach) giải đáp thắc mắc của Hội viên.
  2. ƯU TIÊN KIẾN THỨC ĐÃ ĐƯỢC TRAIN:
  ${contextKnowledge || "Sử dụng kiến thức y khoa và dinh dưỡng khoa học hiện đại."}
  
  TIÊU CHUẨN GIAO TIẾP (BẮT BUỘC TUÂN THỦ):
  ${systemRules || "- Phải thân thiện và chuyên nghiệp.\n- Trả lời bằng tiếng Việt.\n- Không bịa đặt thông tin."}
  
  NGUYÊN TẮC PHẢN HỒI:
  - Ngắn gọn (dưới 100 chữ).
  - Trả lời chân thực, nếu không có kiến thức nạp vào về chủ đề đó, hãy dùng kiến thức y khoa chuẩn.
  - Tuyệt đối không xưng hô thiếu tôn trọng.`;

  try {
    log("Đang gọi API gemini-3-flash-preview...", "system");
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { text: `Lịch sử hội thoại (5 câu gần nhất):\n${history.slice(-5).map(m => `${m.senderName}: ${m.content}`).join("\n")}` },
        { text: `Câu hỏi hiện tại của người dùng: ${latestUserMessage}` }
      ],
      config: { 
        systemInstruction,
        temperature: 0.7,
        topP: 0.9
      }
    });

    const result = response.text;
    if (result) {
      log("AI phản hồi thành công.", "success");
      return result;
    } else {
      log("AI trả về kết quả rỗng (Empty response).", "error");
      return "Lucky AI hiện không thể trả lời câu hỏi này. Vui lòng thử lại sau.";
    }
  } catch (e: any) {
    let friendlyError = "Lỗi hệ thống không xác định.";
    if (e.message?.includes("429")) {
      friendlyError = "LỖI 429: Tài khoản AI (Free Tier) đã hết hạn mức sử dụng trong ngày. Vui lòng thử lại sau 1-2 phút hoặc nâng cấp API Key.";
      log(friendlyError, "error");
    } else if (e.message?.includes("400")) {
      friendlyError = "LỖI 400: Yêu cầu không hợp lệ (có thể do nội dung quá dài hoặc vi phạm chính sách của Google).";
      log(friendlyError, "error");
    } else {
      log(`Lỗi không xác định: ${e.message}`, "error");
      friendlyError = `LỖI: ${e.message}`;
    }
    return friendlyError;
  }
};
