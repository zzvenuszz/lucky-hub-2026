
import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const processYearLogic = (extractedDate: string) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  if (!extractedDate || extractedDate === "0") return now.toISOString().split('T')[0];

  const parts = extractedDate.split(/[-/]/);
  if (parts.length >= 2) {
    const d = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const extractedDateThisYear = new Date(currentYear, m - 1, d, 23, 59, 59);
    let finalYear = currentYear;
    if (extractedDateThisYear > now) {
      finalYear = currentYear - 1;
    }
    return `${finalYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return now.toISOString().split('T')[0];
};

export const extractMetricsFromImage = async (base64Image: string): Promise<Partial<HealthMetric> | null> => {
  const log = (msg: string, type: string = 'ai') => {
    if (window.debugLog) window.debugLog(`[Gemini OCR Proxy] ${msg}`, type);
  };

  log("Gửi yêu cầu trích xuất chỉ số tới Server...");
  
  try {
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image })
    });

    if (!res.ok) throw new Error("Server AI Error");
    
    const result = await res.json();
    if (!result.weight || result.weight <= 0) {
      log("Không tìm thấy chỉ số hợp lệ.", "error");
      return null;
    }

    result.date = processYearLogic(result.date);
    log(`Trích xuất thành công: ${result.weight}kg cho ngày ${result.date}`, "success");
    return result;
  } catch (e: any) {
    log(`LỖI: ${e.message}`, "error");
    return null;
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
    if (window.debugLog) window.debugLog(`[Gemini Coach Proxy] ${msg}`, type);
  };

  try {
    const systemRules = rules.map((r, i) => `${i+1}. ${r.content}`).join("\n");
    const contextKnowledge = knowledge
      .filter(k => latestUserMessage.toLowerCase().includes(k.keyword.toLowerCase()))
      .map(k => `- ${k.keyword}: ${k.content}`).join("\n");

    const systemInstruction = `Bạn là "🍀Trợ lý Lucky". Mục tiêu hội viên: ${userGoal}.
Chỉ số mới nhất: ${latestMetric ? `Cân nặng ${latestMetric.weight}kg, Mỡ cơ thể ${latestMetric.bodyFat}%, Lượng cơ ${latestMetric.muscleMass}kg, Cân đối: ${latestMetric.balanceIndex}` : "Chưa có dữ liệu"}.

QUY TẮC:
${systemRules}

KIẾN THỨC:
${contextKnowledge}

PHONG CÁCH:
- Bạn là một trợ lý sức khỏe thông minh, chuyên nghiệp và tận tâm.
- Trả lời ngắn gọn, đi thẳng vào vấn đề kiến thức.
- Nếu bạn tham gia vào cuộc hội thoại giữa 2 người, hãy đóng vai trò là chuyên gia tư vấn trung lập cung cấp dữ liệu khoa học.`;

    const formattedHistory = history.slice(-6).map(m => ({
      role: (m.senderId === 'ai_coach' || m.senderRole === 'AI') ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch('/api/ai/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: formattedHistory,
        systemInstruction,
        latestUserMessage,
        imageBase64: base64Image
      })
    });

    const data = await res.json();
    return data.text;
  } catch (e) {
    return "Xin lỗi, tôi đang bận một chút.";
  }
};
