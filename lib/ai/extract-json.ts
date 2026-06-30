// Shared JSON extractor for LLM responses. Mirrors the logic already
// hardened in app/api/scout/route.ts so Scout, Coach, and AI Analyst
// share one implementation.
export function extractJsonObject(rawText: string): string {
  const text = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let i = text.indexOf('{')
  while (i !== -1) {
    const end = text.lastIndexOf('}')
    if (end > i) {
      try {
        JSON.parse(text.slice(i, end + 1))
        return text.slice(i, end + 1).trim()
      } catch {
        // not valid from this '{'; try the next one
      }
    }
    i = text.indexOf('{', i + 1)
  }
  throw new Error('no_json_found')
}
