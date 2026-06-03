import { HealthMetric, Message, AIKnowledge, AIRule, HealthGoal } from "../types.ts";

const processYearLogic = (extractedDate: string) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  if (!extractedDate || extractedDate === "0") return now.toISOString().split('T')[0];

  // AI có thể trả về các format: "dd/mm", "mm/dd", "dd-mm", "mm-dd", "dd/mm/yyyy", "yyyy-mm-dd", ...
  const parts = extractedDate.split(/[-/]/).filter(p => p.length > 0);
  if (parts.length >= 2) {
    let d: number, m: number;
    
    // Nếu có 3 parts (yyyy-mm-dd hoặc dd/mm/yyyy)
    if (parts.length >= 3) {
      const first = parseInt(parts[0]);
      // Nếu part đầu > 31 thì đó là năm (yyyy-mm-dd)
      if (first > 31) {
        d = parseInt(parts[2]);
        m = parseInt(parts[1]);
      } else {
        // Ngược lại là dd/mm/yyyy
        d = parseInt(parts[0]);
        m = parseInt(parts[1]);
      }
    } else {
      // Chỉ có 2 parts - xác định đâu là ngày, đâu là tháng
      const first = parseInt(parts[0]);
      const second = parseInt(parts[1]);
      
      if (first > 12 && second <= 12) {
        // first chắc chắn là ngày (dd/mm)
        d = first;
        m = second;
      } else if (second > 12 && first <= 12) {
        // second chắc chắn là ngày (mm/dd)
        m = first;
        d = second;
      } else if (first <= 12 && second <= 12) {
        // Cả hai đều <= 12, không phân biệt được. Mặc định xử lý là dd/mm (format VN)
        d = first;
        m = second;
      } else {
        // Cả hai đều > 12, không hợp lệ
        return now.toISOString().split('T')[0];
      }
    }

    const extractedDateThisYear = new Date(currentYear, m - 1, d, 23, 59, 59);
    let finalYear = currentYear;
    if (isNaN(extractedDateThisYear.getTime())) {
      return now.toISOString().split('T')[0];
    }
    if (extractedDateThisYear > now) {
      finalYear = currentYear - 1;
    }
    return `${finalYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return now.toISOString().split('T')[0];
};

const getAuthHeaders = () => {
  const sessionId = localStorage.getItem('lucky_hub_session');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) {
    headers['Authorization'] = `Bearer ${sessionId}`;
  }
  return headers;
};

export const extractMetricsFromImage = async (base64Image: string, selectedYear?: string): Promise<Partial<HealthMetric> | null> => {
  const startTime = Date.now();
  const log = (msg: string, type: string = 'ai', duration?: number) => {
    if (window.debugLog) window.debugLog(`[AI OCR] ${msg}`, type, duration);
  };

  log("Bắt đầu trích xuất chỉ số...");
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        imageBase64: base64Image,
        selectedYear: selectedYear && selectedYear !== 'auto' ? selectedYear : new Date().getFullYear().toString()
      }),
      signal: controller.signal
    });

    const duration = Date.now() - startTime;
    clearTimeout(id);

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        log(`Lỗi Server: ${errData.message}`, "error", duration);
        return null;
    }
    
    const result = await res.json();
    if (!result.weight || result.weight <= 0) {
      log("Không nhận diện được số liệu.", "error", duration);
      return null;
    }

    result.date = processYearLogic(result.date);
    log(`Trích xuất thành công ngày ${result.date}`, "ai", duration);
    return result;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    clearTimeout(id);
    log(`LỖI: ${e.message}`, "error", duration);
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
  const startTime = Date.now();
  const log = (msg: string, type: string = 'ai', duration?: number) => {
    if (window.debugLog) window.debugLog(`[AI Coach] ${msg}`, type, duration);
  };

  log("Đang khởi tạo phiên tư vấn...");

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 45000);

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
- Trả lời ngắn gọn, chuyên nghiệp.`;

    const formattedHistory = history.slice(-6).map(m => ({
      role: (m.senderId === 'ai_coach' || m.senderRole === 'AI') ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch('/api/ai/coach', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        history: formattedHistory,
        systemInstruction,
        latestUserMessage,
        imageBase64: base64Image
      }),
      signal: controller.signal
    });

    const duration = Date.now() - startTime;
    clearTimeout(id);

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        log(`Lỗi API: ${errData.message}`, "error", duration);
        return null;
    }

    const data = await res.json();
    log("Đã phản hồi", "ai", duration);
    return data.text;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    clearTimeout(id);
    log(`Lỗi Coach: ${e.message}`, "error", duration);
    return null;
  }
};