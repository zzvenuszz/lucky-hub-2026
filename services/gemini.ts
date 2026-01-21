
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

export const extractMetricsFromImage = async (base64Image: string): Promise<Partial<HealthMetric>> => {
  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[Gemini OCR] ${msg}`, type);
  };

  const apiKey = (window as any).process?.env?.API_KEY;
  if (!apiKey) {
    log("LỖI: Thiếu API_KEY", "error");
    return {};
  }
  
  log("Bắt đầu gửi ảnh phân tích...");
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Hãy trích xuất CHÍNH XÁC các chỉ số sức khỏe từ ảnh chụp InBody/Kết quả đo. Nếu chỉ số 'balanceIndex' (cân đối cơ thể) không có trong ảnh, BẮT BUỘC trả về giá trị là 0. Hãy trả về JSON chuẩn." }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "Ngày đo (YYYY-MM-DD)" },
            weight: { type: Type.NUMBER },
            bodyFat: { type: Type.NUMBER },
            boneMinerals: { type: Type.NUMBER },
            waterPercent: { type: Type.NUMBER },
            muscleMass: { type: Type.NUMBER },
            balanceIndex: { type: Type.NUMBER, description: "Nếu không thấy hãy để là 0" },
            energy: { type: Type.NUMBER },
            bioAge: { type: Type.NUMBER },
            visceralFat: { type: Type.NUMBER }
          },
          required: ["weight", "bodyFat", "muscleMass", "balanceIndex"]
        }
      }
    });

    const result = JSON.parse(cleanJsonResponse(response.text || "{}"));
    log(`Đã trích xuất thành công: Cân nặng ${result.weight}kg, Mỡ ${result.bodyFat}%, Cân đối ${result.balanceIndex}`, "success");
    return result;
  } catch (e: any) {
    log(`LỖI TRÍCH XUẤT: ${e.message}`, "error");
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
  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[Gemini Coach] ${msg}`, type);
  };

  const apiKey = (window as any).process?.env?.API_KEY;
  if (!apiKey) {
    log("Thiếu API_KEY", "error");
    return "Lỗi cấu hình: Thiếu API Key.";
  }

  const ai = new GoogleGenAI({ apiKey });

  log("Đang xử lý hội thoại hội viên...");

  // Kiểm tra độ mới của dữ liệu
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
- Chỉ số cân đối: ${latestMetric.balanceIndex}
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

  const formattedHistory = [];
  let lastRole = "";

  const relevantHistory = history.slice(-10);
  for (const m of relevantHistory) {
    const currentRole = m.senderId === 'ai_coach' ? 'model' : 'user';
    if (currentRole !== lastRole && m.content.trim()) {
      formattedHistory.push({
        role: currentRole,
        parts: [{ text: m.content }]
      });
      lastRole = currentRole;
    }
  }

  const userPart: any = { text: latestUserMessage || "Phân tích giúp tôi" };
  const imagePart = base64Image ? { inlineData: { mimeType: 'image/jpeg', data: base64Image } } : null;

  const currentTurn = {
    role: 'user',
    parts: imagePart ? [userPart, imagePart] : [userPart]
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [...formattedHistory, currentTurn],
      config: { systemInstruction, temperature: 0.7 }
    });

    if (response.text) {
      log(`Phản hồi thành công (${response.text.length} ký tự)`, "success");
      return response.text;
    }
  } catch (e: any) {
    log(`LỖI GEMINI: ${e.message}`, "error");
    return "AI đang bận, vui lòng thử lại sau.";
  }

  return "Không có phản hồi từ AI.";
};
