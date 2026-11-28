import crypto from 'crypto';
import { AITrainingReview } from '../models/AITrainingReview.ts';

function redactSensitiveText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email đã ẩn]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[số điện thoại đã ẩn]')
    .trim()
    .slice(0, 1200);
}

export async function queueAITrainingReview(
  query: string,
  knowledge: Array<{ _id?: unknown; keyword: string; tags?: string[]; score?: number }>,
): Promise<void> {
  const safeQuery = redactSensitiveText(query);
  if (safeQuery.length < 8 || !knowledge.length) return;
  const eventKey = crypto.createHash('sha256').update(`${Date.now()}:${Math.random()}:${safeQuery}`).digest('hex');
  const topicScores = new Map<string, number>();
  knowledge.forEach((item, index) => {
    const confidence = Math.max(0.05, Math.min(0.99, Number(item.score || 0.15)));
    const add = (label: string, factor: number) => {
      const normalized = label.trim().replace(/^#+/, '').replace(/\s+/g, ' ');
      if (!normalized || normalized.length > 42 || normalized.split(/\s+/).length > 4) return;
      topicScores.set(normalized, Math.max(topicScores.get(normalized) || 0, confidence * factor * (1 - index * 0.06)));
    };
    add(item.keyword, 1);
    (item.tags || []).forEach(tag => add(tag, 0.92));
  });
  const topics = Array.from(topicScores, ([label, score]) => ({ label, score: Math.round(score * 100) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!topics.length) return;

  try {
    await AITrainingReview.create({
      eventKey,
      query: safeQuery,
      topics,
      suggestedKnowledgeIds: knowledge.map(item => item._id).filter(Boolean),
    });
    console.log('[AITrainingReview] Chat topic proposal queued:', { eventKey, topics: topics.length, knowledge: knowledge.length });
  } catch (error: any) {
    console.error('[AITrainingReview] Failed to queue chat topic proposal:', error?.message || error);
  }
}
