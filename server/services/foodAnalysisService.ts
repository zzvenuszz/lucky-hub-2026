import { callAI, AITaskType } from './aiService.ts';
import { Type } from '@google/genai';
import { getUserNutritionContext, buildUserContextForAI, UserNutritionContext } from './userContextService.ts';
import { buildMealAnalysisContext } from './knowledgeService.ts';

const MODULE = 'FoodAnalysis';

const ANSI = {
  cyan: '\x1b[1;36m', green: '\x1b[1;32m', yellow: '\x1b[1;33m',
  magenta: '\x1b[1;35m', blue: '\x1b[1;34m', red: '\x1b[1;31m',
  gray: '\x1b[90m', reset: '\x1b[0m', purple: '\x1b[1;35m'
};

const logger = {
  info: (module: string, message: string, data?: any) => {
    console.log(`[${module}] ${message}`, data ? JSON.stringify(data) : '');
  },
  warn: (module: string, message: string, data?: any) => {
    console.warn(`[${module}] ⚠️ ${message}`, data ? JSON.stringify(data) : '');
  },
  error: (module: string, message: string, error?: any) => {
    console.error(`[${module}] ❌ ${message}`, error?.message || error || '');
  }
};

// ==================== INTERFACES ====================

export interface DetectedFood {
  name: string;
  estimatedWeight: number; // gram
  calories: number;       // kcal
  protein: number;        // gram
  carbs: number;          // gram
  fat: number;            // gram
  fiber: number;          // gram
  confidence: 'high' | 'medium' | 'low';
}

export interface MealAnalysisResult {
  foods: DetectedFood[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
  analysisConfidence: 'high' | 'medium' | 'low';
  description: string;
}

export interface NutritionAdvice {
  mealAnalysis: MealAnalysisResult;
  userContext: {
    hasMetrics: boolean;
    dailyCalorieTarget: number;
    macrosTarget: { protein: number; carbs: number; fat: number };
    goals: string[];
    bmi: number | null;
  };
  mealAssessment: {
    caloriePercentage: number;       // % so với nhu cầu hàng ngày
    proteinPercentage: number;
    carbsPercentage: number;
    fatPercentage: number;
    isBalanced: boolean;
    assessment: string;             // Đánh giá bữa ăn
  };
  recommendation: string;           // Khuyến cáo từ AI
  suggestedAdjustments: string[];   // Các gợi ý điều chỉnh
  suggestedMenu: string;            // Thực đơn gợi ý từ knowledge base
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Phân tích ảnh thức ăn, nhận diện món, ước tính calo & dinh dưỡng
 * Bước 1: Gọi AI vision để phân tích ảnh và trích xuất thông tin món ăn
 */
export async function analyzeFoodImage(
  requestId: string,
  imageBase64: string,
  userId: string = 'anonymous'
): Promise<MealAnalysisResult> {
  const startTime = Date.now();
  console.log(`\n${ANSI.magenta}╔══════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.magenta}║${ANSI.reset}  🍽️  [FoodAnalysis] Start for user ${userId.padEnd(18)}${ANSI.reset}`);
  console.log(`${ANSI.magenta}║${ANSI.reset}  🆔 Request: ${requestId}${ANSI.reset}`);
  console.log(`${ANSI.magenta}╚══════════════════════════════════════════════╝${ANSI.reset}`);
  logger.info(MODULE, `🍽️ Start food analysis for user ${userId}: requestId=${requestId}`);

  try {
    // Prompt chuyên biệt cho phân tích thức ăn
    const foodPrompt = `Bạn là chuyên gia dinh dưỡng và phân tích thực phẩm hàng đầu. Hãy phân tích ẢNH CHỤP MÓN ĂN/THỨC ĂN này.

NHIỆM VỤ:
1. Nhận diện tất cả các món ăn / thực phẩm có trong ảnh
2. Ước tính khối lượng (gram) của từng món dựa trên kích thước khẩu phần ăn thông thường
3. Tính toán giá trị dinh dưỡng cho từng món: calo, protein, carbs, chất béo, chất xơ
4. Xác định loại bữa ăn: breakfast (sáng), lunch (trưa), dinner (tối), snack (ăn vặt)
5. Đưa ra mô tả ngắn gọn về bữa ăn

YÊU CẦU ĐỊNH DẠNG - Trả về JSON:
{
  "foods": [
    {
      "name": "Tên món ăn (tiếng Việt)",
      "estimatedWeight": 200,
      "calories": 350,
      "protein": 25,
      "carbs": 40,
      "fat": 12,
      "fiber": 5,
      "confidence": "high|medium|low"
    }
  ],
  "mealType": "breakfast|lunch|dinner|snack|unknown",
  "analysisConfidence": "high|medium|low",
  "description": "Mô tả ngắn về bữa ăn này (tiếng Việt)"
}

LƯU Ý QUAN TRỌNG:
- Nếu ảnh KHÔNG phải là thức ăn (ví dụ: ảnh chụp cân, ảnh phong cảnh, ảnh người...), hãy trả về: { "analysisConfidence": "low", "description": "Không phải ảnh thức ăn", "foods": [], ... }
- Tất cả số liệu phải là số (number), không phải chuỗi
- Nếu không chắc chắn về khối lượng, hãy ước tính thận trọng
- Tổng hợp tất cả calo, protein, carbs, fat, fiber từ các món`;

    const payload = {
      contents: [{
        parts: [
          { text: foodPrompt },
          { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foods: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  estimatedWeight: { type: Type.NUMBER },
                  calories: { type: Type.NUMBER },
                  protein: { type: Type.NUMBER },
                  carbs: { type: Type.NUMBER },
                  fat: { type: Type.NUMBER },
                  fiber: { type: Type.NUMBER },
                  confidence: { type: Type.STRING }
                }
              }
            },
            mealType: { type: Type.STRING },
            analysisConfidence: { type: Type.STRING },
            description: { type: Type.STRING }
          }
        }
      }
    };

    console.log(`${ANSI.magenta}▶ [FoodAnalysis] [${requestId}] Calling AI vision for food detection...${ANSI.reset}`);
    const aiResponse = await callAI(requestId, 'food', payload, { userId, modelName: 'auto' });

    let parsed: any;
    try {
      // Sanitize response (xóa markdown code block nếu có)
      let text = (aiResponse.text || '').trim();
      text = text.replace(/^```(?:json)?\s*\n?/i, '');
      text = text.replace(/\n?```\s*$/i, '');
      if (!text.startsWith('{') && !text.startsWith('[')) {
        const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) text = match[1];
      }
      parsed = JSON.parse(text);
    } catch (parseErr) {
      logger.error(MODULE, `Failed to parse AI response for ${requestId}: ${aiResponse.text?.substring(0, 200)}`);
      // Trả về kết quả mặc định nếu parse lỗi
      parsed = { foods: [], mealType: 'unknown', analysisConfidence: 'low', description: 'Không thể phân tích ảnh thức ăn' };
    }

    // Kiểm tra nếu ảnh không phải thức ăn
    const isNotFood = parsed.analysisConfidence === 'low' &&
      (parsed.description?.toLowerCase().includes('không phải') ||
       parsed.description?.toLowerCase().includes('không có thức ăn') ||
       parsed.description?.toLowerCase().includes('không thể phân tích') ||
       (!parsed.foods || parsed.foods.length === 0));

    if (isNotFood) {
      const duration = Date.now() - startTime;
      console.log(`${ANSI.yellow}⚠️ [FoodAnalysis] [${requestId}] Image is NOT food: ${parsed.description} (${duration}ms)${ANSI.reset}`);
      logger.info(MODULE, `⚠️ Image is not food for ${userId}: ${parsed.description}`);

      return {
        foods: [],
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        totalFiber: 0,
        mealType: parsed.mealType || 'unknown',
        analysisConfidence: 'low',
        description: parsed.description || 'Không phải ảnh thức ăn'
      };
    }

    // Parse foods array
    const foods: DetectedFood[] = (parsed.foods || []).map((f: any) => ({
      name: f.name || 'Unknown',
      estimatedWeight: Number(f.estimatedWeight) || 0,
      calories: Number(f.calories) || 0,
      protein: Number(f.protein) || 0,
      carbs: Number(f.carbs) || 0,
      fat: Number(f.fat) || 0,
      fiber: Number(f.fiber) || 0,
      confidence: (f.confidence === 'high' || f.confidence === 'medium' || f.confidence === 'low') ? f.confidence : 'medium'
    }));

    // Calculate totals
    const totalCalories = foods.reduce((sum, f) => sum + f.calories, 0);
    const totalProtein = foods.reduce((sum, f) => sum + f.protein, 0);
    const totalCarbs = foods.reduce((sum, f) => sum + f.carbs, 0);
    const totalFat = foods.reduce((sum, f) => sum + f.fat, 0);
    const totalFiber = foods.reduce((sum, f) => sum + f.fiber, 0);

    const itemNames = foods.map(f => `${f.name}(${f.estimatedWeight}g, ${f.calories}kcal)`).join(', ');

    const duration = Date.now() - startTime;
    console.log(`${ANSI.green}✅ [FoodAnalysis] [${requestId}] Detected ${foods.length} items: ${itemNames} | Total: ${totalCalories}kcal (${duration}ms)${ANSI.reset}`);
    logger.info(MODULE, `✅ Food analysis: ${foods.length} items, total=${totalCalories}kcal, protein=${totalProtein}g, carbs=${totalCarbs}g, fat=${totalFat}g`);

    return {
      foods,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
      mealType: parsed.mealType || 'unknown',
      analysisConfidence: parsed.analysisConfidence || 'medium',
      description: parsed.description || ''
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`${ANSI.red}❌ [FoodAnalysis] [${requestId}] Error: ${error.message} (${duration}ms)${ANSI.reset}`);
    logger.error(MODULE, `❌ Food analysis error: ${error.message}`);

    return {
      foods: [],
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalFiber: 0,
      mealType: 'unknown',
      analysisConfidence: 'low',
      description: 'Lỗi hệ thống khi phân tích ảnh'
    };
  }
}

/**
 * Đưa ra khuyến cáo dinh dưỡng dựa trên kết quả phân tích bữa ăn
 * Bước 2: Kết hợp với context người dùng + knowledge base để đưa ra lời khuyên
 */
export async function generateNutritionAdvice(
  requestId: string,
  mealAnalysis: MealAnalysisResult,
  userId: string
): Promise<NutritionAdvice> {
  const startTime = Date.now();
  console.log(`\n${ANSI.blue}╔══════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.blue}║${ANSI.reset}  💡 [NutritionAdvice] Generating for user ${userId}${ANSI.reset}`);
  console.log(`${ANSI.blue}║${ANSI.reset}  🆔 Request: ${requestId}${ANSI.reset}`);
  console.log(`${ANSI.blue}╚══════════════════════════════════════════════╝${ANSI.reset}`);
  logger.info(MODULE, `💡 Generating nutrition advice for user ${userId}: requestId=${requestId}`);

  try {
    // 1. Lấy context người dùng
    console.log(`${ANSI.blue}▶ [NutritionAdvice] [${requestId}] Fetching user context...${ANSI.reset}`);
    const userContext = await getUserNutritionContext(userId);
    const userContextStr = await buildUserContextForAI(userId);

    logger.info(MODULE, `User context: hasMetrics=${userContext.hasMetrics}, calorieTarget=${userContext.dailyCalorieTarget}, goals=[${userContext.userInfo.healthGoals.join(', ')}]`);

    // 2. Lấy knowledge base context
    const foodKeywords = mealAnalysis.foods.map(f => f.name);
    console.log(`${ANSI.blue}▶ [NutritionAdvice] [${requestId}] Fetching knowledge base for: [${foodKeywords.join(', ')}]...${ANSI.reset}`);
    const knowledgeContext = await buildMealAnalysisContext(foodKeywords, userContext.userInfo.healthGoals);
    logger.info(MODULE, `Knowledge context built: ${knowledgeContext.length} chars`);

    // 3. Tính toán đánh giá bữa ăn
    const calorieTarget = userContext.dailyCalorieTarget || 2000;
    const macrosTarget = userContext.macrosTarget;

    const caloriePercentage = calorieTarget > 0
      ? Math.round((mealAnalysis.totalCalories / calorieTarget) * 100)
      : 0;
    const proteinPercentage = macrosTarget.protein > 0
      ? Math.round((mealAnalysis.totalProtein / macrosTarget.protein) * 100)
      : 0;
    const carbsPercentage = macrosTarget.carbs > 0
      ? Math.round((mealAnalysis.totalCarbs / macrosTarget.carbs) * 100)
      : 0;
    const fatPercentage = macrosTarget.fat > 0
      ? Math.round((mealAnalysis.totalFat / macrosTarget.fat) * 100)
      : 0;

    // Đánh giá cân bằng (protein 20-35%, carbs 45-65%, fat 20-35% tổng calo)
    const proteinCalRatio = mealAnalysis.totalCalories > 0
      ? (mealAnalysis.totalProtein * 4) / mealAnalysis.totalCalories
      : 0;
    const carbsCalRatio = mealAnalysis.totalCalories > 0
      ? (mealAnalysis.totalCarbs * 4) / mealAnalysis.totalCalories
      : 0;
    const fatCalRatio = mealAnalysis.totalCalories > 0
      ? (mealAnalysis.totalFat * 9) / mealAnalysis.totalCalories
      : 0;

    const isBalanced = (
      proteinCalRatio >= 0.10 && proteinCalRatio <= 0.40 &&
      carbsCalRatio >= 0.40 && carbsCalRatio <= 0.70 &&
      fatCalRatio >= 0.15 && fatCalRatio <= 0.40
    );

    let assessment = '';
    if (mealAnalysis.analysisConfidence === 'low' || mealAnalysis.foods.length === 0) {
      assessment = 'Không thể đánh giá bữa ăn này.';
    } else if (caloriePercentage > 100) {
      assessment = `Bữa ăn này cung cấp ${caloriePercentage}% nhu cầu calo hàng ngày. Bạn nên cân nhắc điều chỉnh các bữa ăn còn lại trong ngày.`;
    } else if (caloriePercentage > 70) {
      assessment = `Bữa ăn này khá lớn (${caloriePercentage}% calo hàng ngày). Bạn nên ăn nhẹ hơn vào bữa tiếp theo.`;
    } else if (caloriePercentage < 20) {
      assessment = `Bữa ăn này nhẹ (${caloriePercentage}% calo hàng ngày). Bạn có thể cần bổ sung thêm vào bữa tiếp theo.`;
    } else {
      assessment = `Bữa ăn này chiếm ${caloriePercentage}% nhu cầu calo hàng ngày, phù hợp cho một bữa ăn ${caloriePercentage < 35 ? 'nhẹ' : 'chính'}.`;
    }

    if (!isBalanced && mealAnalysis.foods.length > 0) {
      const imbalances: string[] = [];
      if (proteinCalRatio < 0.10) imbalances.push('thiếu protein');
      if (proteinCalRatio > 0.40) imbalances.push('thừa protein');
      if (carbsCalRatio < 0.40) imbalances.push('thiếu tinh bột');
      if (carbsCalRatio > 0.70) imbalances.push('thừa tinh bột');
      if (fatCalRatio < 0.15) imbalances.push('thiếu chất béo');
      if (fatCalRatio > 0.40) imbalances.push('thừa chất béo');
      assessment += ` Bữa ăn có dấu hiệu ${imbalances.join(', ')}.`;
    }

    // 4. Gọi AI để đưa ra khuyến cáo
    let recommendation = '';
    let suggestedAdjustments: string[] = [];
    let suggestedMenu = '';

    if (mealAnalysis.foods.length > 0) {
      const foodSummary = mealAnalysis.foods.map(f =>
        `- ${f.name}: ${f.estimatedWeight}g, ${f.calories}kcal (P:${f.protein}g, C:${f.carbs}g, F:${f.fat}g, Xơ:${f.fiber}g)`
      ).join('\n');

      const advicePrompt = `Bạn là chuyên gia dinh dưỡng cá nhân hóa. Dựa trên thông tin dưới đây, hãy đưa ra:

1. KHUYẾN CÁO: Lời khuyên cụ thể cho bữa ăn này (tối đa 200 từ, tiếng Việt)
2. ĐIỀU CHỈNH: Danh sách 2-4 gợi ý để cải thiện bữa ăn (tăng/giảm món gì, thay thế bằng gì...)
3. THỰC ĐƠN GỢI Ý: Nếu có thể, hãy gợi ý một thực đơn thay thế tốt hơn cho bữa ăn này dựa trên mục tiêu của người dùng

${userContextStr || 'Người dùng chưa có thông tin chỉ số sức khỏe. Hãy đưa ra khuyến cáo dựa trên kiến thức dinh dưỡng tổng quát.'}

${knowledgeContext || ''}

THÔNG TIN BỮA ĂN:
Loại: ${mealAnalysis.mealType}
Mô tả: ${mealAnalysis.description}
Tổng calo: ${mealAnalysis.totalCalories}kcal
Protein: ${mealAnalysis.totalProtein}g | Carbs: ${mealAnalysis.totalCarbs}g | Fat: ${mealAnalysis.totalFat}g | Chất xơ: ${mealAnalysis.totalFiber}g

Chi tiết:
${foodSummary}

ĐÁNH GIÁ:
${assessment}

Trả về JSON:
{
  "recommendation": "string (khuyến cáo bằng tiếng Việt)",
  "suggestedAdjustments": ["gợi ý 1", "gợi ý 2", "gợi ý 3"],
  "suggestedMenu": "string (thực đơn gợi ý, tiếng Việt, tối đa 300 từ, có thể để trống nếu không phù hợp)"
}`;

      console.log(`${ANSI.blue}▶ [NutritionAdvice] [${requestId}] Calling AI for personalized advice...${ANSI.reset}`);

      const advicePayload = {
        contents: [{ parts: [{ text: advicePrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendation: { type: Type.STRING },
              suggestedAdjustments: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestedMenu: { type: Type.STRING }
            }
          }
        }
      };

      const adviceResponse = await callAI(requestId, 'meal-plan', advicePayload, { userId, modelName: 'auto' });

      try {
        let text = (adviceResponse.text || '').trim();
        text = text.replace(/^```(?:json)?\s*\n?/i, '');
        text = text.replace(/\n?```\s*$/i, '');
        if (!text.startsWith('{')) {
          const match = text.match(/(\{[\s\S]*\})/);
          if (match) text = match[1];
        }
        const parsedAdvice = JSON.parse(text);
        recommendation = parsedAdvice.recommendation || '';
        suggestedAdjustments = parsedAdvice.suggestedAdjustments || [];
        suggestedMenu = parsedAdvice.suggestedMenu || '';
      } catch (parseErr) {
        // Fallback nếu parse lỗi
        logger.warn(MODULE, `Failed to parse advice response, using fallback`);
        recommendation = adviceResponse.text || 'Không thể tạo khuyến cáo.';
      }
    }

    const duration = Date.now() - startTime;
    console.log(`${ANSI.green}✅ [NutritionAdvice] [${requestId}] Generated for user ${userId} (${duration}ms)${ANSI.reset}`);
    console.log(`${ANSI.green}   📝 Recommendation: ${recommendation.substring(0, 100)}...${ANSI.reset}`);
    logger.info(MODULE, `✅ Nutrition advice generated: ${recommendation.length} chars, ${suggestedAdjustments.length} adjustments`);

    return {
      mealAnalysis,
      userContext: {
        hasMetrics: userContext.hasMetrics,
        dailyCalorieTarget: userContext.dailyCalorieTarget,
        macrosTarget: userContext.macrosTarget,
        goals: userContext.userInfo.healthGoals,
        bmi: userContext.bmi
      },
      mealAssessment: {
        caloriePercentage,
        proteinPercentage,
        carbsPercentage,
        fatPercentage,
        isBalanced,
        assessment
      },
      recommendation,
      suggestedAdjustments,
      suggestedMenu
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`${ANSI.red}❌ [NutritionAdvice] [${requestId}] Error: ${error.message} (${duration}ms)${ANSI.reset}`);
    logger.error(MODULE, `❌ Nutrition advice error: ${error.message}`);

    return {
      mealAnalysis,
      userContext: {
        hasMetrics: false,
        dailyCalorieTarget: 0,
        macrosTarget: { protein: 0, carbs: 0, fat: 0 },
        goals: [],
        bmi: null
      },
      mealAssessment: {
        caloriePercentage: 0,
        proteinPercentage: 0,
        carbsPercentage: 0,
        fatPercentage: 0,
        isBalanced: false,
        assessment: 'Lỗi hệ thống khi tạo khuyến cáo.'
      },
      recommendation: 'Rất tiếc, hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
      suggestedAdjustments: [],
      suggestedMenu: ''
    };
  }
}

/**
 * Tổng hợp phân tích bữa ăn + khuyến cáo (2 bước trong 1 call)
 * Đây là hàm chính mà route sẽ gọi
 */
export async function analyzeMeal(
  requestId: string,
  imageBase64: string,
  userId: string
): Promise<NutritionAdvice> {
  const startTime = Date.now();
  console.log(`\n${ANSI.cyan}╔══════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.cyan}║${ANSI.reset}  🍽️  [AnalyzeMeal] Full analysis for ${userId}${ANSI.reset}`);
  console.log(`${ANSI.cyan}║${ANSI.reset}  🆔 Request: ${requestId}${ANSI.reset}`);
  console.log(`${ANSI.cyan}╚══════════════════════════════════════════════╝${ANSI.reset}`);

  try {
    // Bước 1: Phân tích ảnh thức ăn
    const mealAnalysis = await analyzeFoodImage(requestId, imageBase64, userId);

    // Nếu ảnh không phải thức ăn, trả về context tối thiểu
    if (mealAnalysis.analysisConfidence === 'low' && mealAnalysis.foods.length === 0) {
      const duration = Date.now() - startTime;
      console.log(`${ANSI.yellow}⚠️ [AnalyzeMeal] [${requestId}] Not a food image, returning basic info (${duration}ms)${ANSI.reset}`);

      const userContext = await getUserNutritionContext(userId);

      return {
        mealAnalysis,
        userContext: {
          hasMetrics: userContext.hasMetrics,
          dailyCalorieTarget: userContext.dailyCalorieTarget,
          macrosTarget: userContext.macrosTarget,
          goals: userContext.userInfo.healthGoals,
          bmi: userContext.bmi
        },
        mealAssessment: {
          caloriePercentage: 0,
          proteinPercentage: 0,
          carbsPercentage: 0,
          fatPercentage: 0,
          isBalanced: false,
          assessment: mealAnalysis.description || 'Không thể phân tích ảnh này.'
        },
        recommendation: '',
        suggestedAdjustments: [],
        suggestedMenu: ''
      };
    }

    // Bước 2: Đưa ra khuyến cáo dinh dưỡng
    const advice = await generateNutritionAdvice(requestId, mealAnalysis, userId);

    const duration = Date.now() - startTime;
    console.log(`\n${ANSI.green}╔══════════════════════════════════════════════╗${ANSI.reset}`);
    console.log(`${ANSI.green}║${ANSI.reset}  ✅ [AnalyzeMeal] Completed for user ${userId}${ANSI.reset}`);
    console.log(`${ANSI.green}║${ANSI.reset}  🍽️  ${mealAnalysis.foods.length} món | ${mealAnalysis.totalCalories}kcal${ANSI.reset}`);
    console.log(`${ANSI.green}║${ANSI.reset}  ⏱️  ${duration}ms${ANSI.reset}`);
    console.log(`${ANSI.green}╚══════════════════════════════════════════════╝${ANSI.reset}`);

    return advice;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`${ANSI.red}❌ [AnalyzeMeal] [${requestId}] Error: ${error.message} (${duration}ms)${ANSI.reset}`);
    logger.error(MODULE, `❌ AnalyzeMeal error: ${error.message}`);

    throw error;
  }
}

/**
 * Gợi ý thực đơn dựa trên mục tiêu người dùng
 */
export async function suggestMeal(
  requestId: string,
  userId: string,
  options?: {
    mealType?: string;
    calorieTarget?: number;
    dietaryPreference?: string;
  }
): Promise<{ mealSuggestions: string; basedOn: string }> {
  const startTime = Date.now();
  console.log(`\n${ANSI.purple}╔══════════════════════════════════════════════╗${ANSI.reset}`);
  console.log(`${ANSI.purple}║${ANSI.reset}  📋 [SuggestMeal] Creating meal plan for ${userId}${ANSI.reset}`);
  console.log(`${ANSI.purple}║${ANSI.reset}  🆔 Request: ${requestId}${ANSI.reset}`);
  console.log(`${ANSI.purple}╚══════════════════════════════════════════════╝${ANSI.reset}`);

  try {
    // Lấy context người dùng
    const userContext = await getUserNutritionContext(userId);
    const userContextStr = await buildUserContextForAI(userId);

    // Lấy knowledge base về meal plan
    const knowledgeContext = await buildMealAnalysisContext(
      [options?.mealType || '', options?.dietaryPreference || '', ...userContext.userInfo.healthGoals].filter(Boolean),
      userContext.userInfo.healthGoals
    );

    const targetCalories = options?.calorieTarget || userContext.dailyCalorieTarget || 2000;

    const prompt = `Bạn là chuyên gia dinh dưỡng và đầu bếp. Hãy gợi ý thực đơn dựa trên thông tin sau:

${userContextStr || 'Người dùng chưa có thông tin chỉ số.'}

${knowledgeContext || ''}

YÊU CẦU: ${options?.mealType ? `Loại bữa ăn: ${options.mealType}` : 'Gợi ý thực đơn cho một ngày'}
${options?.dietaryPreference ? `Sở thích ăn uống: ${options.dietaryPreference}` : ''}
Mục tiêu calo: ${targetCalories}kcal/ngày

Hãy gợi ý thực đơn chi tiết với các món ăn cụ thể, khối lượng, calo và dinh dưỡng.
Trả về text thuần (không JSON).`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      config: {}
    };

    const response = await callAI(requestId, 'meal-plan', payload, { userId, modelName: 'auto' });

    const basedOn = userContext.hasMetrics
      ? `Dựa trên chỉ số sức khỏe và mục tiêu của bạn`
      : `Dựa trên thông tin cơ bản của bạn (chưa có chỉ số sức khỏe chi tiết)`;

    const duration = Date.now() - startTime;
    console.log(`${ANSI.green}✅ [SuggestMeal] [${requestId}] Generated for user ${userId} (${duration}ms)${ANSI.reset}`);

    return {
      mealSuggestions: response.text || '',
      basedOn
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log(`${ANSI.red}❌ [SuggestMeal] [${requestId}] Error: ${error.message} (${duration}ms)${ANSI.reset}`);
    logger.error(MODULE, `❌ SuggestMeal error: ${error.message}`);

    return {
      mealSuggestions: 'Rất tiếc, không thể tạo gợi ý thực đơn lúc này. Vui lòng thử lại sau.',
      basedOn: ''
    };
  }
}