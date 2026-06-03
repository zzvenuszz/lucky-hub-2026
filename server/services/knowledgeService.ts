import { Knowledge } from '../models/Knowledge.ts';

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

const MODULE = 'KnowledgeService';

/**
 * Tìm kiếm knowledge entries liên quan đến từ khóa
 * Hỗ trợ full-text search + category filter
 */
export async function searchKnowledge(
  keywords: string[],
  options?: {
    category?: string;
    limit?: number;
  }
): Promise<Array<{ keyword: string; content: string; category: string; tags: string[] }>> {
  const limit = options?.limit || 10;
  const startTime = Date.now();

  try {
    if (!keywords || keywords.length === 0) {
      logger.warn(MODULE, 'searchKnowledge called with empty keywords');
      return [];
    }

    // Tạo regex pattern từ keywords
    const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const searchPattern = escapedKeywords.join('|');

    // Xây dựng query
    const query: any = {
      $or: [
        { keyword: { $regex: searchPattern, $options: 'i' } },
        { tags: { $in: keywords.map(k => new RegExp(k, 'i')) } },
        { content: { $regex: searchPattern, $options: 'i' } },
        { relatedKeywords: { $in: keywords.map(k => new RegExp(k, 'i')) } }
      ]
    };

    // Thêm filter category nếu có
    if (options?.category) {
      query.category = options.category;
    }

    const results = await Knowledge.find(query)
      .select('keyword content category tags')
      .limit(limit)
      .lean()
      .exec();

    const duration = Date.now() - startTime;
    logger.info(MODULE, `searchKnowledge: found ${results.length} entries for keywords [${keywords.join(', ')}] in ${duration}ms`);

    return results.map(r => ({
      keyword: r.keyword,
      content: r.content,
      category: r.category,
      tags: r.tags || []
    }));
  } catch (error: any) {
    logger.error(MODULE, `searchKnowledge error for keywords [${keywords.join(', ')}]`, error);
    return [];
  }
}

/**
 * Lấy knowledge entries theo category
 * Dùng để load các kiến thức nền tảng cho AI (ví dụ: kiến thức dinh dưỡng tổng quát)
 */
export async function getKnowledgeByCategory(
  category: string,
  limit: number = 20
): Promise<Array<{ keyword: string; content: string; tags: string[]; category: string }>> {
  const startTime = Date.now();

  try {
    const results = await Knowledge.find({ category })
      .select('keyword content tags category')
      .limit(limit)
      .lean()
      .exec();

    const duration = Date.now() - startTime;
    logger.info(MODULE, `getKnowledgeByCategory: found ${results.length} entries for category "${category}" in ${duration}ms`);

    return results.map(r => ({
      keyword: r.keyword,
      content: r.content,
      tags: r.tags || [],
      category: r.category
    }));
  } catch (error: any) {
    logger.error(MODULE, `getKnowledgeByCategory error for category "${category}"`, error);
    return [];
  }
}

/**
 * Build context string từ knowledge base để làm system prompt cho AI
 */
export async function buildKnowledgeContext(
  keywords: string[],
  options?: {
    category?: string;
    maxEntries?: number;
  }
): Promise<string> {
  const startTime = Date.now();

  try {
    const entries = await searchKnowledge(keywords, {
      category: options?.category,
      limit: options?.maxEntries || 10
    });

    if (entries.length === 0) {
      logger.info(MODULE, `buildKnowledgeContext: no entries found, returning empty context`);
      return '';
    }

    // Xây dựng context string từ các entries
    const contextParts = entries.map((entry, index) => {
      return `[Kiến thức ${index + 1}] Chủ đề: ${entry.keyword}
${entry.content}
---`;
    });

    const context = `Dưới đây là các kiến thức chuyên môn liên quan đến yêu cầu của bạn (từ hệ thống Knowledge Base):

${contextParts.join('\n\n')}

Hãy sử dụng các kiến thức trên kết hợp với chuyên môn của bạn để đưa ra câu trả lời chính xác và hữu ích nhất.`;

    const duration = Date.now() - startTime;
    logger.info(MODULE, `buildKnowledgeContext: built context with ${entries.length} entries (${context.length} chars) in ${duration}ms`);

    return context;
  } catch (error: any) {
    logger.error(MODULE, `buildKnowledgeContext error`, error);
    return '';
  }
}

/**
 * Format knowledge entries thành ngữ cảnh cho phân tích bữa ăn
 * Ưu tiên các entries category 'nutrition' và 'meal_plan'
 */
export async function buildMealAnalysisContext(
  foodKeywords: string[],
  userGoals: string[] = []
): Promise<string> {
  const startTime = Date.now();

  try {
    // Kết hợp keywords từ thức ăn và mục tiêu người dùng
    const allKeywords = [...new Set([...foodKeywords, ...userGoals])];

    // Lấy entries về dinh dưỡng tổng quát
    const nutritionKnowledge = await getKnowledgeByCategory('nutrition', 5);

    // Lấy entries về meal plan
    const mealPlanKnowledge = await getKnowledgeByCategory('meal_plan', 5);

    // Lấy entries liên quan cụ thể đến keywords
    const specificKnowledge = allKeywords.length > 0
      ? await searchKnowledge(allKeywords, { limit: 10 })
      : [];

    // Kết hợp tất cả, loại bỏ trùng lặp
    const seen = new Set<string>();
    const allEntries = [...nutritionKnowledge, ...mealPlanKnowledge, ...specificKnowledge]
      .filter(entry => {
        const key = entry.keyword + entry.content.substring(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 15); // Giới hạn 15 entries

    if (allEntries.length === 0) {
      logger.info(MODULE, `buildMealAnalysisContext: no entries found`);
      return '';
    }

    const contextParts = allEntries.map((entry, index) => {
      return `[Kiến thức ${index + 1}] Danh mục: ${entry.category || 'general'} | Chủ đề: ${entry.keyword}
${entry.content}`;
    });

    const context = `📚 KIẾN THỨC DINH DƯỠNG THAM KHẢO:

${contextParts.join('\n\n')}

Sử dụng các kiến thức trên để phân tích bữa ăn và đưa ra khuyến cáo phù hợp.`;

    const duration = Date.now() - startTime;
    logger.info(MODULE, `buildMealAnalysisContext: built context with ${allEntries.length} entries (${context.length} chars) in ${duration}ms`);

    return context;
  } catch (error: any) {
    logger.error(MODULE, `buildMealAnalysisContext error`, error);
    return '';
  }
}