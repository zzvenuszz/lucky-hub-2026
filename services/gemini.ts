
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
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    daysOld = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isDataOld = daysOld > 3;
  }

  const filteredKnowledge = knowledge.filter(k => 
    latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
    k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
  );

  const contextKnowledge = filteredKnowledge.map(k => `- ${k.keyword}: ${k.content}`).join("\n");
  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

  const metricContext = latestMetric ? `
CHỈ SỐ CƠ THỂ MỚI NHẤT (Ngày ${latestMetric.date}):
- Cân nặng: ${latestMetric.weight}kg
- Tỉ lệ mỡ: ${latestMetric.bodyFat}%
- Khối lượng cơ: ${latestMetric.muscleMass}kg
- Mỡ nội tạng: Level ${latestMetric.visceralFat}
- Tuổi sinh học: ${latestMetric.bioAge} tuổi
${isDataOld ? `⚠️ LƯU Ý: Chỉ số này đã cũ (${daysOld} ngày trước). Hãy nhắc hội viên cập nhật chỉ số mới để tư vấn chính xác hơn.` : ""}
  ` : "Hội viên chưa có dữ liệu đo lường gần đây. Hãy khuyên họ thực hiện phép đo đầu tiên.";

  log(`Gửi yêu cầu AI: Goal="${userGoal}", MetricStatus=${isDataOld ? 'Cũ' : 'Mới'}${base64Image ? ", Có kèm ảnh" : ""}`, "info");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia dinh dưỡng & sức khỏe tận tâm tại Lucky Hub.

BỐI CẢNH HỘI VIÊN:
- Mục tiêu chính: **${userGoal}**
${metricContext}

NHIỆM VỤ CỦA BẠN:
1. **Nếu có ảnh bữa ăn**: Phân tích món ăn, ước tính calo/dinh dưỡng. Đánh giá bữa ăn này CÓ PHÙ HỢP với mục tiêu "${userGoal}" và các chỉ số hiện tại (như mỡ nội tạng, cơ bắp) của họ không.
2. **Nếu dữ liệu chỉ số cũ > 3 ngày**: Hãy khéo léo lồng ghép lời nhắc hội viên cập nhật chỉ số vào cuối câu trả lời một cách chân thành.
3. **Tư vấn**: Luôn dựa trên Tri thức & Quy tắc của Lucky Hub.

ĐỊNH DẠNG:
- Tiếng Việt chuyên nghiệp, dùng Emoji phù hợp.
- Chia đoạn rõ ràng bằng \n.
- In đậm các thông tin quan trọng.

TRI THỨC & QUY TẮC:
${contextKnowledge}
${systemRules}`;

  for (const currentModel of modelsToTry) {
    try {
      const parts: any[] = [{ text: `Tin nhắn người dùng: ${latestUserMessage}` }];
      if (base64Image) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { text: `Lịch sử chat: ${history.slice(-3).map(m => m.content).join(" | ")}` },
          { parts }
        ],
        config: { systemInstruction, temperature: 0.7 }
      });

      if (response.text) return response.text;
    } catch (e: any) {
      log(`Lỗi Model ${currentModel}: ${e.message}`, "warning");
    }
  }
  return "AI đang bận một chút, bạn hãy thử lại sau giây lát nhé!";
};
