import { User } from '../models/User.ts';
import { Metric } from '../models/Metric.ts';
import { Goal } from '../models/Goal.ts';

const MODULE = 'UserContextService';

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

export interface UserNutritionContext {
  hasMetrics: boolean;
  latestMetrics: {
    weight: number;
    bodyFat: number;
    muscleMass: number;
    waterPercent: number;
    boneMinerals: number;
    visceralFat: number;
    energy: number;
    bioAge: number;
    balanceIndex: number;
    date: string;
  } | null;
  goals: Array<{
    type: string;
    targetValue: number;
    startValue: number;
    status: string;
    progress: number;
  }>;
  dailyCalorieTarget: number;
  macrosTarget: {
    protein: number; // gram
    carbs: number;   // gram
    fat: number;     // gram
  };
  bmi: number | null;
  userInfo: {
    height: number;
    weight: number;
    gender: string;
    age: number;
    healthGoals: string[];
  };
}

/**
 * Tính tuổi từ birthDate string (YYYY-MM-DD)
 */
function calculateAge(birthDate: string): number {
  if (!birthDate) return 0;
  try {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return 0;
  }
}

/**
 * Tính BMR (Basal Metabolic Rate) - Công thức Mifflin-St Jeor
 */
function calculateBMR(weight: number, height: number, age: number, gender: string): number {
  if (!weight || !height || !age) return 0;
  // Nam: BMR = 10 * weight + 6.25 * height - 5 * age + 5
  // Nữ: BMR = 10 * weight + 6.25 * height - 5 * age - 161
  const bmr = 10 * weight + 6.25 * height - 5 * age;
  return gender === 'Nữ' ? bmr - 161 : bmr + 5;
}

/**
 * Tính TDEE (Total Daily Energy Expenditure) dựa trên activity level
 * Mặc định sử dụng sedentary (1.2) nếu không có thông tin
 */
function calculateTDEE(bmr: number, activityLevel: number = 1.2): number {
  return Math.round(bmr * activityLevel);
}

/**
 * Tính calorie target dựa trên mục tiêu
 */
function calculateCalorieTarget(tdee: number, goals: string[]): number {
  if (!tdee || tdee <= 0) return 0;

  const goalLower = goals.map(g => g.toLowerCase());

  // Giảm cân: TDEE - 500
  if (goalLower.some(g => g.includes('giảm cân') || g.includes('giảm'))) {
    return Math.max(tdee - 500, 1200); // Không dưới 1200 calo
  }

  // Tăng cân: TDEE + 300
  if (goalLower.some(g => g.includes('tăng cân') || g.includes('tăng'))) {
    return tdee + 300;
  }

  // Thay đổi cấu trúc cơ thể: TDEE (maintenance)
  if (goalLower.some(g => g.includes('thay đổi cấu trúc') || g.includes('body recom'))) {
    return tdee;
  }

  // Mặc định: duy trì
  return tdee;
}

/**
 * Tính macros target dựa trên calorie target và mục tiêu
 * Protein: 25-30% | Carbs: 45-50% | Fat: 25-30%
 */
function calculateMacrosTarget(calorieTarget: number, goals: string[]): { protein: number; carbs: number; fat: number } {
  if (!calorieTarget || calorieTarget <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  const goalLower = goals.map(g => g.toLowerCase());

  let proteinRatio = 0.25;
  let carbsRatio = 0.50;
  let fatRatio = 0.25;

  // Giảm cân: tăng protein, giảm carbs
  if (goalLower.some(g => g.includes('giảm cân') || g.includes('giảm'))) {
    proteinRatio = 0.30;
    carbsRatio = 0.40;
    fatRatio = 0.30;
  }

  // Tăng cơ: tăng protein
  if (goalLower.some(g => g.includes('tăng cân') || g.includes('tăng cơ') || g.includes('body recom'))) {
    proteinRatio = 0.35;
    carbsRatio = 0.40;
    fatRatio = 0.25;
  }

  // Tiểu đường: giảm carbs
  if (goalLower.some(g => g.includes('tiểu đường'))) {
    proteinRatio = 0.30;
    carbsRatio = 0.35;
    fatRatio = 0.35;
  }

  return {
    protein: Math.round((calorieTarget * proteinRatio) / 4),  // 1g protein = 4 calo
    carbs: Math.round((calorieTarget * carbsRatio) / 4),      // 1g carbs = 4 calo
    fat: Math.round((calorieTarget * fatRatio) / 9),          // 1g fat = 9 calo
  };
}

/**
 * Lấy context dinh dưỡng của người dùng
 * Bao gồm: metrics mới nhất, goals, calorie target, macros target, BMI
 * Nếu user chưa có metrics nào, vẫn trả về context cơ bản (dựa trên thông tin user)
 */
export async function getUserNutritionContext(userId: string): Promise<UserNutritionContext> {
  const startTime = Date.now();
  logger.info(MODULE, `getUserNutritionContext: fetching context for user ${userId}`);

  try {
    // 1. Lấy thông tin user
    const user = await User.findById(userId).select('height weight gender birthDate healthGoals').lean().exec();

    if (!user) {
      logger.warn(MODULE, `getUserNutritionContext: user ${userId} not found, returning empty context`);
      return {
        hasMetrics: false,
        latestMetrics: null,
        goals: [],
        dailyCalorieTarget: 0,
        macrosTarget: { protein: 0, carbs: 0, fat: 0 },
        bmi: null,
        userInfo: { height: 0, weight: 0, gender: 'Nam', age: 0, healthGoals: [] }
      };
    }

    const age = calculateAge(user.birthDate || '');
    const healthGoals: string[] = user.healthGoals || [];

    // 2. Lấy metric mới nhất
    const latestMetric = await Metric.findOne({ userId })
      .sort({ date: -1, createdAt: -1 })
      .lean()
      .exec();

    const hasMetrics = !!latestMetric;
    const latestWeight = latestMetric?.weight || user.weight || 0;
    const latestHeight = user.height || 0;

    // 3. Tính BMI
    const bmi = (latestHeight > 0 && latestWeight > 0)
      ? Math.round((latestWeight / ((latestHeight / 100) * (latestHeight / 100))) * 10) / 10
      : null;

    // 4. Lấy goals active
    const goals = await Goal.find({ userId, status: 'active' })
      .select('type targetValue startValue status progress')
      .lean()
      .exec();

    const goalsData = goals.map(g => ({
      type: g.type,
      targetValue: g.targetValue,
      startValue: g.startValue,
      status: g.status,
      progress: g.progress,
    }));

    // 5. Tính TDEE và calorie target
    const bmr = calculateBMR(latestWeight, latestHeight, age, user.gender || 'Nam');
    const tdee = calculateTDEE(bmr);
    const dailyCalorieTarget = calculateCalorieTarget(tdee, healthGoals);
    const macrosTarget = calculateMacrosTarget(dailyCalorieTarget, healthGoals);

    // Log goal descriptions
    const goalLabels = goalsData.map(g => `${g.type}: ${g.startValue}→${g.targetValue} (${g.progress}%)`);

    const result: UserNutritionContext = {
      hasMetrics,
      latestMetrics: latestMetric ? {
        weight: latestMetric.weight,
        bodyFat: latestMetric.bodyFat,
        muscleMass: latestMetric.muscleMass,
        waterPercent: latestMetric.waterPercent,
        boneMinerals: latestMetric.boneMinerals,
        visceralFat: latestMetric.visceralFat,
        energy: latestMetric.energy,
        bioAge: latestMetric.bioAge,
        balanceIndex: latestMetric.balanceIndex,
        date: latestMetric.date,
      } : null,
      goals: goalsData,
      dailyCalorieTarget,
      macrosTarget,
      bmi,
      userInfo: {
        height: latestHeight,
        weight: latestWeight,
        gender: user.gender || 'Nam',
        age,
        healthGoals,
      }
    };

    const duration = Date.now() - startTime;
    logger.info(MODULE, `getUserNutritionContext: ✅ completed for user ${userId} in ${duration}ms`, {
      hasMetrics,
      bmi,
      dailyCalorieTarget,
      macros: macrosTarget,
      goals: goalLabels,
      age
    });

    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(MODULE, `getUserNutritionContext: ❌ error for user ${userId} in ${duration}ms`, error);

    // Return fallback context instead of throwing
    return {
      hasMetrics: false,
      latestMetrics: null,
      goals: [],
      dailyCalorieTarget: 0,
      macrosTarget: { protein: 0, carbs: 0, fat: 0 },
      bmi: null,
      userInfo: { height: 0, weight: 0, gender: 'Nam', age: 0, healthGoals: [] }
    };
  }
}

/**
 * Format context người dùng thành string để làm system prompt cho AI
 */
export async function buildUserContextForAI(userId: string): Promise<string> {
  const startTime = Date.now();
  logger.info(MODULE, `buildUserContextForAI: building context string for user ${userId}`);

  try {
    const ctx = await getUserNutritionContext(userId);

    if (!ctx || (!ctx.hasMetrics && ctx.userInfo.weight === 0)) {
      const duration = Date.now() - startTime;
      logger.info(MODULE, `buildUserContextForAI: no user data available for ${userId} (${duration}ms)`);
      return '';
    }

    const lines: string[] = [];
    lines.push(`📋 THÔNG TIN NGƯỜI DÙNG:`);
    lines.push(`- Giới tính: ${ctx.userInfo.gender}`);
    lines.push(`- Tuổi: ${ctx.userInfo.age}`);
    lines.push(`- Chiều cao: ${ctx.userInfo.height}cm`);
    lines.push(`- Cân nặng: ${ctx.userInfo.weight}kg`);

    if (ctx.bmi !== null) {
      lines.push(`- BMI: ${ctx.bmi}`);
    }

    if (ctx.userInfo.healthGoals.length > 0) {
      lines.push(`- Mục tiêu sức khỏe: ${ctx.userInfo.healthGoals.join(', ')}`);
    }

    if (ctx.hasMetrics && ctx.latestMetrics) {
      lines.push(``);
      lines.push(`📊 CHỈ SỐ SỨC KHỎE MỚI NHẤT (${ctx.latestMetrics.date}):`);
      if (ctx.latestMetrics.bodyFat) lines.push(`- Mỡ cơ thể: ${ctx.latestMetrics.bodyFat}%`);
      if (ctx.latestMetrics.muscleMass) lines.push(`- Khối lượng cơ: ${ctx.latestMetrics.muscleMass}kg`);
      if (ctx.latestMetrics.visceralFat) lines.push(`- Mỡ nội tạng: ${ctx.latestMetrics.visceralFat}`);
      if (ctx.latestMetrics.waterPercent) lines.push(`- Tỷ lệ nước: ${ctx.latestMetrics.waterPercent}%`);
      if (ctx.latestMetrics.bioAge) lines.push(`- Tuổi sinh học: ${ctx.latestMetrics.bioAge}`);
    }

    if (ctx.dailyCalorieTarget > 0) {
      lines.push(``);
      lines.push(`🎯 NHU CẦU DINH DƯỠNG HÀNG NGÀY:`);
      lines.push(`- Calo mục tiêu: ${ctx.dailyCalorieTarget} kcal/ngày`);
      if (ctx.macrosTarget.protein > 0) {
        lines.push(`- Protein: ${ctx.macrosTarget.protein}g (${Math.round(ctx.macrosTarget.protein * 4 / ctx.dailyCalorieTarget * 100)}%)`);
        lines.push(`- Carbs: ${ctx.macrosTarget.carbs}g (${Math.round(ctx.macrosTarget.carbs * 4 / ctx.dailyCalorieTarget * 100)}%)`);
        lines.push(`- Fat: ${ctx.macrosTarget.fat}g (${Math.round(ctx.macrosTarget.fat * 9 / ctx.dailyCalorieTarget * 100)}%)`);
      }
    }

    if (ctx.goals.length > 0) {
      lines.push(``);
      lines.push(`🏆 MỤC TIÊU ĐANG THEO DÕI:`);
      ctx.goals.forEach(g => {
        lines.push(`- ${g.type}: ${g.startValue} → ${g.targetValue} (${g.progress}%)`);
      });
    }

    const context = lines.join('\n');

    const duration = Date.now() - startTime;
    logger.info(MODULE, `buildUserContextForAI: built context (${context.length} chars) in ${duration}ms`);

    return context;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error(MODULE, `buildUserContextForAI: error for user ${userId} in ${duration}ms`, error);
    return '';
  }
}