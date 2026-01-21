
import { GoogleGenAI, Type } from "@google/genai";
import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const cleanJsonResponse = (text: string): string => {
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) return match[0];
  return text.trim();
};

export const extractMetricsFromImage = async (base64Image: string): Promise<Partial<HealthMetric>> => {
  const apiKey = (window as any).process?.env?.API_KEY;
  if (!apiKey) {
    if (window.debugLog) window.debugLog("LỖI: Thiếu API_KEY trong environment", "error");
    return {};
  }
  
  const ai = new GoogleGenAI({ apiKey });
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
  } catch (e: any) {
    if (window.debugLog) window.debugLog(`LỖI TRÍCH XUẤT ẢNH: ${e.message}`, "error");
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
    // Gửi log tới Sandbox Admin
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
    // Gửi log tới console hệ thống (khung đen góc phải)
    if (window.debugLog) window.debugLog(`[Gemini Service] ${msg}`, type === 'error' ? 'error' : 'info');
  };

  const apiKey = (window as any).process?.env?.API_KEY;
  if (!apiKey) {
    log("Thiếu API_KEY. Vui lòng kiểm tra index.html", "error");
    return "Lỗi cấu hình: Thiếu API Key.";
  }

  const ai = new GoogleGenAI({ apiKey });

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

  // CHUẨN HÓA LỊCH SỬ: Đảm bảo xen kẽ user-model và không có tin nhắn rỗng
  const formattedHistory = [];
  let lastRole = "";

  const relevantHistory = history.slice(-10); // Lấy 10 tin gần nhất
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

  // Đảm bảo tin nhắn cuối cùng là của user
  const contents: any[] = [...formattedHistory];
  const userPart: any = { text: latestUserMessage || "Phân tích giúp tôi" };
  const imagePart = base64Image ? { inlineData: { mimeType: 'image/jpeg', data: base64Image } } : null;

  if (lastRole === 'user') {
    // Nếu tin cuối trong sử là user, ta gộp vào hoặc bỏ qua để tránh lỗi 400
    // Ở đây ta chọn cách push tin nhắn hiện tại như một model response giả hoặc xử lý lại
    // Nhưng đơn giản nhất là đảm bảo tin nhắn hiện tại được gửi đi đúng role.
  }

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
      log(`AI phản hồi thành công`, "success");
      return response.text;
    }
  } catch (e: any) {
    const errorDetail = e.message || "Lỗi không xác định";
    log(`LỖI API GEMINI: ${errorDetail}`, "error");
    
    if (errorDetail.includes("400")) return "Lỗi cấu hình tin nhắn (400). Hãy thử xóa bớt lịch sử chat.";
    if (errorDetail.includes("403")) return "Lỗi quyền truy cập (403). Kiểm tra lại API Key.";
    if (errorDetail.includes("429")) return "AI đang quá tải (429). Thử lại sau 1 phút.";
  }

  return "Rất tiếc, tôi đang gặp sự cố kết nối. Chi tiết lỗi đã được ghi vào Debug Console (góc phải).";
};
