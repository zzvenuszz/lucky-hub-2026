
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
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Danh sách các model để thử (theo thứ tự ưu tiên)
  const modelsToTry = [
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite-latest',
    'gemini-3-pro-preview'
  ];

  // Chuẩn bị dữ liệu Prompt
  const contextKnowledge = knowledge
    .filter(k => 
      latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
      k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
    )
    .map(k => `- ${k.keyword}: ${k.content}`)
    .join("\n");

  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

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

  // Vòng lặp thử từng model nếu bị lỗi overload
  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    log(`Đang thử sử dụng Model: ${currentModel} (Lần thử ${i + 1}/${modelsToTry.length})`, "system");

    try {
      const response = await ai.models.generateContent({
        model: currentModel,
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
        log(`Model ${currentModel} phản hồi thành công.`, "success");
        return result;
      }
    } catch (e: any) {
      const isOverloaded = e.message?.includes("503") || e.message?.includes("overloaded");
      const isQuotaExceeded = e.message?.includes("429") || e.message?.includes("quota");

      if (isOverloaded) {
        log(`Model ${currentModel} đang bị quá tải (503).`, "warning");
      } else if (isQuotaExceeded) {
        log(`Model ${currentModel} hết hạn mức (429).`, "warning");
      } else {
        log(`Lỗi không mong muốn tại ${currentModel}: ${e.message}`, "error");
      }

      // Nếu còn model dự phòng trong danh sách, tiếp tục vòng lặp
      if (i < modelsToTry.length - 1) {
        log(`Đang kích hoạt cơ chế dự phòng, chuyển sang model tiếp theo...`, "info");
        continue;
      }

      // Nếu đã thử hết mà vẫn lỗi
      log("Đã thử tất cả các model khả dụng nhưng không thành công.", "error");
      return `[LỖI HỆ THỐNG]: Toàn bộ hệ thống AI đang quá tải. Vui lòng thử lại sau ít phút.`;
    }
  }

  return "Xin lỗi, tôi gặp trục trặc kỹ thuật. Hãy thử lại sau nhé!";
};
