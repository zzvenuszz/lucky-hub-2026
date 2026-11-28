import { Knowledge } from '../models/Knowledge.ts';
import { AITrainingReview } from '../models/AITrainingReview.ts';
import { callAIEmbeddings } from './ai/oaiRouter.ts';

export type KnowledgeCategory = 'nutrition' | 'meal_plan' | 'exercise' | 'health_advice' | 'disease' | 'general';
export interface RetrievedKnowledge {
  _id?: any;
  keyword: string;
  content: string;
  category: string;
  tags: string[];
  source?: string;
  pageNumber?: number | null;
  embedding?: number[];
  embeddingModel?: string;
}

const CACHE_TTL_MS = 60_000;
const MAX_VECTOR_CACHE_ENTRIES = 8000;
let vectorCache: { expiresAt: number; entries: RetrievedKnowledge[] } | null = null;
let lastEmbeddingWarningAt = 0;
let lastTextIndexWarningAt = 0;
let embeddingUnavailableUntil = 0;
let rejectedFeedbackCache: { expiresAt: number; entries: Array<{ query: string; knowledgeIds: string[] }> } | null = null;

const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const STOP_WORDS = new Set(['cua', 'nhung', 'nhu', 'cho', 'voi', 'theo', 'la', 'gi', 'nao', 'sao', 'toi', 'ban', 'minh', 'hay', 'va', 'co', 'khong', 'cac', 'mot', 'nhieu', 'duoc', 'lam', 'the', 'nay', 'do', 'bi', 've', 'tu', 'trong', 'khi', 'can', 'nen', 'giup', 'xin', 'hoi']);

export function classifyKnowledgeCategories(query: string): KnowledgeCategory[] {
  const text = normalize(query);
  const matches: KnowledgeCategory[] = [];
  const groups: Array<[KnowledgeCategory, RegExp]> = [
    ['nutrition', /dinh duong|calo|kcal|calories|protein|dam|carb|tinh bot|chat beo|fat|mon an|thuc pham|bua an|an uong|vitamin|khoang chat|macro|tdee|bmr/],
    ['meal_plan', /thuc don|ke hoach an|goi y bua|menu|meal plan/],
    ['exercise', /tap luyen|bai tap|the duc|gym|cardio|co bap|suc manh|van dong|chay bo|yoga/],
    ['health_advice', /suc khoe|trieu chung|benh ly|chan doan|thuoc|dieu tri|bac si|dinh luong|inbody|chi so co the/],
    ['disease', /tieu duong|huyet ap|tim mach|gan nhiem mo|than|dau khop|loang xuong|benh/],
  ];
  for (const [category, pattern] of groups) if (pattern.test(text)) matches.push(category);
  return matches.length ? Array.from(new Set(matches)) : ['general'];
}

function tokenize(text: string): string[] {
  return Array.from(new Set(normalize(text).match(/[a-z0-9]{2,}/g) || []))
    .filter(word => !STOP_WORDS.has(word))
    .slice(0, 24);
}

function getDirectTagMatches(entry: RetrievedKnowledge, query: string): string[] {
  const queryWords = new Set(tokenize(query));
  return (entry.tags || []).filter(tag => {
    const tagWords = tokenize(tag);
    return tagWords.length > 0 && tagWords.every(word => queryWords.has(word));
  });
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function lexicalScore(entry: RetrievedKnowledge, words: string[]): number {
  const searchable = normalize(`${entry.keyword} ${(entry.tags || []).join(' ')} ${entry.content}`);
  const matches = words.reduce((score, word) => score + (searchable.includes(word)
    ? normalize(entry.keyword).includes(word) ? 3 : (entry.tags || []).some(tag => normalize(tag).includes(word)) ? 2 : 1
    : 0), 0);
  return matches / Math.max(1, words.length * 3);
}

async function getVectorEntries(): Promise<RetrievedKnowledge[]> {
  if (vectorCache && vectorCache.expiresAt > Date.now()) return vectorCache.entries;
  const entries = await Knowledge.find({ embedding: { $exists: true, $ne: [] } })
    .select('+embedding keyword content category tags source pageNumber embeddingModel')
    .limit(MAX_VECTOR_CACHE_ENTRIES)
    .lean()
    .exec();
  vectorCache = { expiresAt: Date.now() + CACHE_TTL_MS, entries: entries as RetrievedKnowledge[] };
  return vectorCache.entries;
}

export function invalidateKnowledgeRetrievalCache(): void {
  vectorCache = null;
  rejectedFeedbackCache = null;
}

async function getRejectedFeedback(): Promise<Array<{ query: string; knowledgeIds: string[] }>> {
  if (rejectedFeedbackCache && rejectedFeedbackCache.expiresAt > Date.now()) return rejectedFeedbackCache.entries;
  const reviews = await AITrainingReview.find({ status: 'rejected' })
    .select('query suggestedKnowledgeIds')
    .sort({ reviewedAt: -1 })
    .limit(500)
    .lean()
    .exec();
  const entries = reviews.map(review => ({ query: review.query, knowledgeIds: (review.suggestedKnowledgeIds || []).map(String) }));
  rejectedFeedbackCache = { expiresAt: Date.now() + CACHE_TTL_MS, entries };
  return entries;
}

export async function searchRelevantKnowledge(
  query: string,
  healthGoals: string[] = [],
  limit = 5,
  categories: string[] = [],
): Promise<Array<RetrievedKnowledge & { score: number }>> {
  const startedAt = Date.now();
  const sourceWords = `${query} ${healthGoals.join(' ')}`.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const words = tokenize(`${query} ${healthGoals.join(' ')}`);
  if (!words.length) return [];
  const rawTerms = sourceWords.filter(word => !STOP_WORDS.has(normalize(word)) && normalize(word).length > 1).slice(0, 24);
  const escaped = Array.from(new Set([...rawTerms, ...words])).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(escaped.join('|'), 'i');
  // Category prediction is only a hint; don't exclude matching Knowledge when the classifier misses its category.
  const categoryFilter = {};
  const lexicalQuery = {
    ...categoryFilter,
    $or: [
      { keyword: { $regex: regex } },
      { tags: { $in: words.map(word => new RegExp(word, 'i')) } },
      { relatedKeywords: { $in: words.map(word => new RegExp(word, 'i')) } },
      { content: { $regex: regex } },
    ],
  };
  const lexicalDocs = await Knowledge.find(lexicalQuery).select('keyword content category tags source pageNumber').limit(120).lean().exec() as RetrievedKnowledge[];
  let textIndexDocs: RetrievedKnowledge[] = [];
  try {
    textIndexDocs = await Knowledge.find({ ...categoryFilter, $text: { $search: rawTerms.join(' ') } })
      .select('keyword content category tags source pageNumber')
      .limit(120).lean().exec() as RetrievedKnowledge[];
  } catch (error: any) {
    if (Date.now() - lastTextIndexWarningAt > 10 * 60_000) {
      console.warn('[KnowledgeRetrieval] Mongo text index unavailable; regex retrieval remains active:', error?.message || error);
      lastTextIndexWarningAt = Date.now();
    }
  }
  const lexicalCandidates = [...lexicalDocs, ...textIndexDocs];
  const bestLexicalScore = lexicalCandidates.reduce((best, entry) => Math.max(best, lexicalScore(entry, words)), 0);

  const shouldCheckSemantic = bestLexicalScore < 0.65 && words.length >= 2 && query.trim().length >= 8;
  const vectorEntries = shouldCheckSemantic ? await getVectorEntries().catch(error => {
    console.error('[KnowledgeRetrieval] Failed to load cached vectors:', error?.message || error);
    return [] as RetrievedKnowledge[];
  }) : [];
  let queryVector: number[] | null = null;
  let queryEmbeddingModel = '';
  const shouldUseSemantic = vectorEntries.length > 0 && shouldCheckSemantic;
  if (shouldUseSemantic && Date.now() >= embeddingUnavailableUntil) {
    try {
      const embeddingResult = await callAIEmbeddings(`knowledge-query-${Date.now().toString(36)}`, [query], 'chat-retrieval', 'query');
      queryVector = embeddingResult.embeddings[0] || null;
      queryEmbeddingModel = `${embeddingResult.providerUsed || ''}:${embeddingResult.modelUsed || ''}`;
      embeddingUnavailableUntil = 0;
    } catch (error: any) {
      embeddingUnavailableUntil = Date.now() + 60_000;
      if (Date.now() - lastEmbeddingWarningAt > 10 * 60_000) {
        console.warn('[KnowledgeRetrieval] Semantic retrieval unavailable; lexical fallback is active:', error?.message || error);
        lastEmbeddingWarningAt = Date.now();
      }
    }
  }

  const candidates = new Map<string, RetrievedKnowledge>();
  [...lexicalDocs, ...textIndexDocs].forEach((entry: any) => candidates.set(String(entry._id || `${entry.keyword}:${entry.pageNumber}`), entry));
  if (queryVector) {
    const eligibleVectors = vectorEntries;
    eligibleVectors.filter(entry => entry.embeddingModel === queryEmbeddingModel)
      .forEach(entry => candidates.set(String(entry._id || `${entry.keyword}:${entry.pageNumber}`), entry));
  }

  const scored = Array.from(candidates.values()).map(entry => {
    const entryLexicalScore = lexicalScore(entry, words);
    const directTagMatches = getDirectTagMatches(entry, query);
    const hasSemanticScore = !!(queryVector && entry.embedding);
    const semanticScore = hasSemanticScore ? Math.max(0, cosineSimilarity(queryVector as number[], entry.embedding as number[])) : 0;
    const categoryBoost = categories.includes(entry.category) ? 0.06 : 0;
    const baseScore = (hasSemanticScore ? (semanticScore * 0.65 + entryLexicalScore * 0.35) : entryLexicalScore) + categoryBoost;
    const score = directTagMatches.length ? Math.max(baseScore, 0.72 + categoryBoost) : baseScore;
    return { ...entry, score, hasSemanticScore, directTagMatches, embedding: undefined };
  });
  const rejectedFeedback = await getRejectedFeedback().catch(error => {
    console.warn('[KnowledgeRetrieval] Could not load rejected training feedback:', error?.message || error);
    return [];
  });
  const feedbackWords = new Set(words);
  const feedbackMatchedIds = new Set<string>();
  rejectedFeedback.forEach(feedback => {
    const rejectedWords = tokenize(feedback.query);
    if (!rejectedWords.length) return;
    const overlap = rejectedWords.filter(word => feedbackWords.has(word)).length / Math.max(1, rejectedWords.length);
    if (overlap >= 0.7) feedback.knowledgeIds.forEach(id => feedbackMatchedIds.add(id));
  });
  const adjusted = scored.map(entry => feedbackMatchedIds.has(String(entry._id))
    ? { ...entry, score: entry.score * 0.2 }
    : entry);
  const ranked = adjusted.filter(entry => {
    const wasRejected = feedbackMatchedIds.has(String(entry._id));
    if (wasRejected && entry.score < 0.45) return false;
    return entry.score >= (entry.hasSemanticScore ? 0.24 : 0.08);
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 8)));

  console.log('[KnowledgeRetrieval] Search completed:', {
    queryTerms: words.length,
    lexicalCandidates: lexicalDocs.length + textIndexDocs.length,
    semanticEnabled: !!queryVector,
    semanticSkippedForStrongLexicalMatch: !shouldUseSemantic && bestLexicalScore >= 0.55,
    selected: ranked.length,
    categories: ranked.map(entry => entry.category),
    rejectedFeedbackApplied: feedbackMatchedIds.size,
    sources: ranked.map(entry => ({ source: entry.source || entry.keyword, pageNumber: entry.pageNumber || null, score: Number(entry.score.toFixed(3)), matchedTags: entry.directTagMatches })),
    durationMs: Date.now() - startedAt,
  });
  return ranked.map(({ hasSemanticScore: _hasSemanticScore, directTagMatches: _directTagMatches, ...entry }) => entry);
}
