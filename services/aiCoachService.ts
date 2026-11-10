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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  return headers;
};

export const extractMetricsFromImage = async (base64Image: string, selectedYear?: string): Promise<Partial<HealthMetric> | null> => {
  const startTime = Date.now();
  const log = (msg: string, type: string = 'ai', duration?: number) => {
    if (type === 'error') {
      console.error(`[VisionOCR][Single] ❌ ${msg}`, duration !== undefined ? `(${duration}ms)` : '');
    } else {
      console.log(`[VisionOCR][Single] ${msg}`, duration !== undefined ? `(${duration}ms)` : '');
    }
    if (window.debugLog) window.debugLog(`[AI OCR] ${msg}`, type, duration);
  };

  const resolvedYear = selectedYear && selectedYear !== 'auto' ? selectedYear : new Date().getFullYear().toString();
  log(`Step 1: Bắt đầu gửi ảnh đơn tới /api/ai/extract | base64Len=${base64Image.length} (~${Math.round(base64Image.length * 0.75 / 1024)}KB) | year=${resolvedYear}`);

  try {
    const res = await fetch('/api/ai/extract', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ 
        imageBase64: base64Image,
        selectedYear: resolvedYear
      })
    });

    const duration = Date.now() - startTime;
    log(`Step 2: Server phản hồi HTTP ${res.status} sau ${duration}ms`, res.ok ? 'ai' : 'error', duration);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('[VisionOCR][Single] ❌ Chi tiết lỗi từ server:', errData);
      throw new Error(errData.message || `Server trả về lỗi ${res.status}`);
    }
    
    const result = await res.json();
    console.log('[VisionOCR][Single] 📋 Step 3: Dữ liệu JSON thô từ AI:', result);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('AI trả về dữ liệu không đúng định dạng.');
    }
    if (!Number.isFinite(Number(result.weight)) || Number(result.weight) <= 0) {
      log(`Step 4: Không nhận diện được cân nặng hợp lệ (weight=${result.weight}).`, "error", duration);
      return null;
    }

    result.date = processYearLogic(result.date);
    log(`Step 4: ✅ Trích xuất thành công ngày ${result.date} (weight=${result.weight}kg)`, "ai", duration);
    return result;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    log(`LỖI sau ${duration}ms: ${e.message}`, "error", duration);
    throw e;
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
    const formattedHistory = history.slice(-6).map(m => ({
      role: (m.senderId === 'ai_coach' || m.senderRole === 'AI') ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch('/api/ai/coach', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        history: formattedHistory,
        latestUserMessage,
        imageBase64: base64Image,
        autoContext: true  // Sử dụng backend để build system prompt đầy đủ
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