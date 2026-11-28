const MAX_TAG_WORDS = 4;
const MAX_TAG_LENGTH = 42;
const MAX_TAG_COUNT = 12;
const TAG_NOISE_WORDS = new Set(['phuong', 'phap', 'khoa', 'hoc', 'hieu', 'qua', 'duy', 'nhat', 'tot', 'co', 'the', 'nen', 'can', 've', 'cho', 'cua', 'va']);

export function normalizeKnowledgeTags(input: unknown, keyword = ''): string[] {
  const candidates = Array.isArray(input) ? [...input] : [];
  const keywordWords = keyword.trim().split(/\s+/).filter(Boolean);
  if (keywordWords.length <= MAX_TAG_WORDS && keyword.trim().length <= MAX_TAG_LENGTH) candidates.unshift(keyword);
  const seen = new Set<string>();
  const expanded = candidates
    .filter((tag): tag is string => typeof tag === 'string')
    .flatMap(tag => {
      const clean = tag.trim().replace(/^#+/, '').replace(/\s+/g, ' ').replace(/[.,;:!?]+$/g, '');
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length <= MAX_TAG_WORDS && clean.length <= MAX_TAG_LENGTH) return [clean];
      const meaningful = words.filter(word => !TAG_NOISE_WORDS.has(word.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')));
      if (meaningful.length <= MAX_TAG_WORDS) return [meaningful.join(' ')];
      const phrases: string[] = [];
      for (let size = MAX_TAG_WORDS; size >= 2; size -= 1) {
        for (let index = 0; index + size <= meaningful.length; index += size === MAX_TAG_WORDS ? 1 : 2) {
          phrases.push(meaningful.slice(index, index + size).join(' '));
        }
      }
      return phrases;
    })
    .filter(tag => {
      const words = tag.split(/\s+/).filter(Boolean);
      const key = tag.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
      if (!tag || tag.length > MAX_TAG_LENGTH || words.length > MAX_TAG_WORDS || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TAG_COUNT);
  return expanded;
}
