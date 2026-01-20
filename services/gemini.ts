
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
  
  const modelsToTry = [
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3-pro-preview'
  ];

  const contextKnowledge = knowledge
    .filter(k => 
      latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
      k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
    )
    .map(k => `- ${k.keyword}: ${k.content}`)
    .join("\n");

  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia tư vấn sức khỏe tại Lucky Hub.

NHIỆM VỤ ĐỊNH DẠNG (BẮT BUỘC):
- Sử dụng xuống dòng (\n) thường xuyên giữa các ý.
- Sử dụng gạch đầu dòng (• hoặc -) cho các danh sách khuyên dùng.
- Sử dụng in đậm (**văn bản**) cho các từ khóa quan trọng.
- Trình bày có cấu trúc: 
  1. Lời chào ngắn.
  2. Nội dung giải thích chính (chia thành các đoạn nhỏ).
  3. Lời khuyên cụ thể (dùng gạch đầu dòng).
  4. Lời chúc/Kết bài.

NGUỒN KIẾN THỨC:
${contextKnowledge || "Sử dụng kiến thức y khoa chuẩn quốc tế."}

QUY TẮC GIAO TIẾP:
${systemRules || "- Thân thiện, chuyên nghiệp, tiếng Việt.\n- Không bịa đặt."}

NGUYÊN TẮC PHẢN HỒI:
- Ngắn gọn nhưng đầy đủ ý, không viết thành một khối văn bản dài dằng dặc.
- Nếu tư vấn về bệnh lý, phải kèm lời khuyên tham khảo ý kiến bác sĩ chuyên khoa.`;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    log(`Sử dụng động cơ: ${currentModel} (${i + 1}/${modelsToTry.length})`, "system");

    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { text: `Lịch sử hội thoại:\n${history.slice(-5).map(m => `${m.senderName}: ${m.content}`).join("\n")}` },
          { text: `Câu hỏi: ${latestUserMessage}` }
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
      const errorMsg = e.message || "";
      const isOverloaded = errorMsg.includes("503") || errorMsg.includes("overloaded");
      const isQuotaExceeded = errorMsg.includes("429") || errorMsg.includes("quota");
      const isNotFound = errorMsg.includes("404") || errorMsg.includes("not found");

      if (isOverloaded) log(`Model ${currentModel} quá tải (503).`, "warning");
      else if (isQuotaExceeded) log(`Model ${currentModel} hết hạn mức/quota (429).`, "warning");
      else if (isNotFound) log(`Model ${currentModel} không tồn tại (404).`, "error");
      else log(`Lỗi tại ${currentModel}: ${errorMsg}`, "error");

      if (i < modelsToTry.length - 1) {
        log(`Đang chuyển sang model dự phòng tiếp theo...`, "info");
        continue;
      }

      log("Đã cạn kiệt tất cả model dự phòng.", "error");
      return `[LỖI HỆ THỐNG]: AI đang bận xử lý dữ liệu khác. Vui lòng thử lại sau giây lát.`;
    }
  }

  return "Lucky AI hiện đang bảo trì, HLV sẽ hỗ trợ bạn sớm!";
};
