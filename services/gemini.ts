
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
  base64Image?: string
): Promise<string | null> => {
  const log = (msg: string, type: string = 'info') => {
    if (window.debugLog) window.debugLog(`[GeminiService] ${msg}`, type);
    window.dispatchEvent(new CustomEvent('ai-sandbox-log', { detail: { msg, type } }));
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelsToTry = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

  const filteredKnowledge = knowledge.filter(k => 
    latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()) ||
    k.keyword.toLowerCase().split(' ').some(word => latestUserMessage.toLowerCase().includes(word))
  );

  const contextKnowledge = filteredKnowledge.map(k => `- ${k.keyword}: ${k.content}`).join("\n");
  const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");

  log(`Phân tích: Mục tiêu="${userGoal}", Tri thức khớp=${filteredKnowledge.length}, Quy tắc=${rules.length}${base64Image ? ", Có ảnh gửi kèm" : ""}`, "info");

  const systemInstruction = `Bạn là "Lucky AI Advisor" - chuyên gia dinh dưỡng & sức khỏe cao cấp tại Lucky Hub.

THÔNG TIN QUAN TRỌNG VỀ HỘI VIÊN:
- Mục tiêu sức khỏe hiện tại: ${userGoal} (Mọi lời khuyên phải bám sát mục tiêu này).

NHIỆM VỤ PHÂN TÍCH HÌNH ẢNH (NẾU CÓ):
1. **Nhận diện**: Liệt kê các thành phần thực phẩm, món ăn hoặc dữ liệu sức khỏe trong ảnh.
2. **Dinh dưỡng**: Ước tính Calo, Protein, Carb, Fat dựa trên khẩu phần nhìn thấy.
3. **Đánh giá**: Bữa ăn này có giúp đạt được mục tiêu "${userGoal}" không? Tại sao?
4. **Giải pháp**: Nếu chưa phù hợp, hãy gợi ý thay thế thực phẩm hoặc thay đổi cách chế biến.

QUY TẮC PHẢN HỒI (BẮT BUỘC):
- Sử dụng tiếng Việt thân thiện, chuyên nghiệp.
- Định dạng rõ ràng bằng xuống dòng và gạch đầu dòng (•).
- In đậm (**từ khóa**) quan trọng.
- Tuyệt đối tuân thủ tri thức và quy tắc được nạp dưới đây.

TRI THỨC CHUYÊN MÔN:
${contextKnowledge || "Kiến thức y khoa & dinh dưỡng chuẩn quốc tế."}

QUY CHUẨN GIAO TIẾP:
${systemRules || "- Thân thiện, tận tâm.\n- Không đưa ra chẩn đoán y khoa thay thế bác sĩ."}`;

  for (const currentModel of modelsToTry) {
    try {
      const parts: any[] = [{ text: `Câu hỏi từ hội viên: ${latestUserMessage}` }];
      if (base64Image) {
        parts.push({ 
          inlineData: { 
            mimeType: 'image/jpeg', 
            data: base64Image 
          } 
        });
      }

      const response = await ai.models.generateContent({
        model: currentModel,
        contents: [
          { text: `Lịch sử hội thoại gần đây:\n${history.slice(-3).map(m => `${m.senderName}: ${m.content}`).join("\n")}` },
          { parts }
        ],
        config: { 
          systemInstruction,
          temperature: 0.65,
          topP: 0.95
        }
      });

      if (response.text) {
        log(`Model ${currentModel} đã xử lý xong phản hồi.`, "success");
        return response.text;
      }
    } catch (e: any) {
      log(`Model ${currentModel} lỗi: ${e.message}`, "warning");
    }
  }
  return "Tôi đang gặp chút gián đoạn khi phân tích dữ liệu. Bạn vui lòng gửi lại tin nhắn hoặc ảnh nhé!";
};
