/**
 * NorthSoft.AI.ContentCreator — Robust AI JSON Response Parser
 *
 * Extracts and parses JSON objects from raw AI model responses.
 * Handles markdown code fences (```json ... ```), leading/trailing commentary,
 * and unescaped newlines in JSON strings.
 */

export function parseAiJsonResponse<T = Record<string, unknown>>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('AI completion response is empty.');
  }

  let cleaned = rawText.trim();

  // 1. Strip Markdown Code Fences (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?\s*```$/i, '')
      .trim();
  }

  // 2. Direct JSON Parse Attempt
  try {
    const res = JSON.parse(cleaned);
    if (res && typeof res === 'object' && !Array.isArray(res)) {
      return res as T;
    }
  } catch {
    // Fall through to extraction heuristics
  }

  // 3. Extract JSON object substring between first '{' and last '}'
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');

  if (startIdx !== -1 && endIdx > startIdx) {
    const jsonSub = cleaned.substring(startIdx, endIdx + 1);
    try {
      const res = JSON.parse(jsonSub);
      if (res && typeof res === 'object' && !Array.isArray(res)) {
        return res as T;
      }
    } catch {
      // 4. Heuristic fix for raw unescaped newlines inside strings
      try {
        const sanitized = jsonSub.replace(/\r?\n/g, '\\n');
        const res = JSON.parse(sanitized);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          return res as T;
        }
      } catch {
        // Fall through
      }
    }
  }

  // 5. Regex extraction heuristic for "body" and "title" when JSON is truncated or has control chars
  const bodyMatch = rawText.match(/"body"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (bodyMatch && bodyMatch[1]) {
    const unescapedBody = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\"/g, '"');
    const titleMatch = rawText.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    const titleText = titleMatch?.[1] ? titleMatch[1].replace(/\\"/g, '"') : undefined;
    return {
      title: titleText,
      body: unescapedBody,
      language: 'en',
      tone: 'conversational',
      claims: [],
      hashtags: ['#SmallBusiness'],
    } as unknown as T;
  }

  throw new Error('AI completion response does not contain a valid JSON object.');
}
