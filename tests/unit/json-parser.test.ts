import { describe, expect, it } from 'vitest';
import { parseAiJsonResponse } from '../../src/core/json-parser';

describe('Robust AI JSON Response Parser', () => {
  it('parses valid JSON object cleanly', () => {
    const raw = JSON.stringify({
      title: 'Valid Title',
      body: 'Valid Body',
      language: 'en',
    });

    const parsed = parseAiJsonResponse<{ title: string; body: string }>(raw);
    expect(parsed.title).toBe('Valid Title');
    expect(parsed.body).toBe('Valid Body');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const raw = '```json\n{\n  "title": "Fenced Title",\n  "body": "Fenced Body"\n}\n```';

    const parsed = parseAiJsonResponse<{ title: string; body: string }>(raw);
    expect(parsed.title).toBe('Fenced Title');
    expect(parsed.body).toBe('Fenced Body');
  });

  it('parses JSON with surrounding conversational text', () => {
    const raw = `Here is your requested social media post:

{
  "title": "Extracted Title",
  "body": "Extracted Body text for small business"
}

Hope this helps!`;

    const parsed = parseAiJsonResponse<{ title: string; body: string }>(raw);
    expect(parsed.title).toBe('Extracted Title');
    expect(parsed.body).toBe('Extracted Body text for small business');
  });

  it('throws descriptive error on truly malformed JSON', () => {
    const raw = 'Here is invalid json { title: unquoted, body: broken';
    expect(() => parseAiJsonResponse(raw)).toThrow('AI completion response does not contain a valid JSON object.');
  });

  it('throws descriptive error on empty or non-string input', () => {
    expect(() => parseAiJsonResponse('')).toThrow('AI completion response is empty.');
    expect(() => parseAiJsonResponse('   ')).toThrow('AI completion response is empty.');
  });
});
