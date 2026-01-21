
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
    if (window.debugLog) window.debugLog(`[GeminiService] ${msg}`, type);
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelsToTry = ['gemini-3-flash-preview', 'gemini-flash-latest'];

  // Kiểm tra độ mới của dữ liệu (3 ngày)
  let isDataOld = false;
  let daysOld = 0;
  if (latestMetric) {
    const lastDate = new Date(latestMetric.date);
    const now = new Date();
    // Đặt giờ về 0 để so sánh chính xác theo ngày
    lastDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    isDataOld = daysOld > 3;
  }

  const filteredKnowledge = knowledge.filter(k => 
    latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
    k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
  );

  const contextKnowledge = filteredKnowledge.map(k => `- ${k.keyword}: ${k.content}`).join("\n");
  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

  const metricContext = latestMetric ? `
CHỈ SỐ CƠ THỂ MỚI NHẤT (Đo ngày ${latestMetric.date}):
- Cân nặng: ${latestMetric.weight}kg
- Tỉ lệ mỡ: ${latestMetric.bodyFat}%
- Khối lượng cơ: ${latestMetric.muscleMass}kg
- Mỡ nội tạng: Level ${latestMetric.visceralFat}
- Tuổi sinh học: ${latestMetric.bioAge} tuổi

TÌNH TRẠNG DỮ LIỆU: ${isDataOld ? `⚠️ Dữ liệu này đã cũ (${daysOld} ngày). BẮT BUỘC bạn phải nhắc hội viên cập nhật chỉ số mới để việc tư vấn bữa ăn/sức khỏe đạt hiệu quả cao nhất.` : "Dữ liệu mới cập nhật, hãy sử dụng để phân tích."}
  ` : "Hội viên CHƯA CÓ dữ liệu đo lường. Hãy khuyên họ thực hiện đo để có tư vấn chính xác.";

  log(`Phân tích: Mục tiêu="${userGoal}", Dữ liệu=${isDataOld ? 'Quá hạn' : 'Đạt chuẩn'}${base64Image ? ", Có ảnh" : ""}`, "info");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia dinh dưỡng cao cấp.

THÔNG TIN HỘI VIÊN:
- Mục tiêu: ${userGoal}
${metricContext}

NHIỆM VỤ:
1. **Phân tích ảnh (nếu có)**: Nhận diện thực phẩm, calo và đối chiếu với mục tiêu "${userGoal}".
2. **Đối chiếu chỉ số**: Nếu hội viên đang thừa mỡ nội tạng hoặc thiếu cơ, hãy nhắc nhở trong bữa ăn.
3. **Nhắc nhở cập nhật**: Nếu dữ liệu đã quá 3 ngày, hãy lồng ghép lời nhắc cập nhật chỉ số vào cuối câu trả lời một cách tinh tế và quan tâm.

QUY TẮC:
${systemRules}
${contextKnowledge}`;

  const historyParts = history.slice(-5).map(m => ({
    text: `${m.senderName} (${m.senderRole}): ${m.content}`
  }));

  const currentUserParts: any[] = [{ text: `Câu hỏi/Hành động: ${latestUserMessage}` }];
  if (base64Image) {
    currentUserParts.push({
      inlineData: { mimeType: 'image/jpeg', data: base64Image }
    });
  }

  for (const currentModel of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { parts: historyParts.length > 0 ? historyParts : [{ text: "Bắt đầu hội thoại." }] },
          { parts: currentUserParts }
        ],
        config: { 
          systemInstruction, 
          temperature: 0.75,
          topP: 0.95
        }
      });

      if (response.text) {
        log(`Phản hồi thành công từ model ${currentModel}`, "success");
        return response.text;
      }
    } catch (e: any) {
      log(`Lỗi Model ${currentModel}: ${e.message}`, "error");
    }
  }
  return "Tôi đã nhận được thông tin nhưng đang gặp chút trục trặc khi kết nối bộ não AI. Bạn vui lòng thử lại sau giây lát nhé!";
};
