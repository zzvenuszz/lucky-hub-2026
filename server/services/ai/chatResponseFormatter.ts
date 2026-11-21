export function normalizeChatResponse(text: string): string {
  return String(text || '')
    .trim()
    .replace(/^\s*(?:\*\*)?\s*(?:🍀\s*)?Trợ lý Lucky(?:\*\*)?\s*:\s*/i, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
