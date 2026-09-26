import { describe, expect, it } from 'vitest';
import { app } from '../../src/index';

describe('Content Security Policy (CSP) Security & Compliance', () => {
  it('returns valid Content-Security-Policy header on /admin without invalid inline wildcards', async () => {
    const res = await app.request('/admin');
    expect(res.status).toBe(200);

    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(csp).not.toBeNull();

    const cspStr = csp as string;

    // 1. Must NOT contain invalid mid-string wildcard hostnames like scontent*.xx.fbcdn.net
    expect(cspStr).not.toContain('scontent*');
    expect(cspStr).not.toContain('scontent*.xx.fbcdn.net');

    // 2. Regex check: No hostname label may contain an asterisk except as the leftmost label (*.domain.tld)
    // Matches invalid patterns like sub*.domain.com or host*name
    const invalidWildcardRegex = /https?:\/\/([a-zA-Z0-9_-]+\*[a-zA-Z0-9_.-]*)/g;
    const matches = Array.from(cspStr.matchAll(invalidWildcardRegex));
    expect(matches.length).toBe(0);

    // 3. Verify img-src directive contains valid host sources
    expect(cspStr).toContain("img-src 'self' data: https://*.fbcdn.net https://*.facebook.com https://*.fbsbx.com");
  });

  it('validates CSP compliance across API and root routes', async () => {
    const routes = ['/', '/api/health'];

    for (const route of routes) {
      const res = await app.request(route);
      const csp = res.headers.get('content-security-policy');
      if (csp) {
        expect(csp).not.toContain('scontent*');
        const invalidWildcardRegex = /https?:\/\/([a-zA-Z0-9_-]+\*[a-zA-Z0-9_.-]*)/g;
        expect(Array.from(csp.matchAll(invalidWildcardRegex)).length).toBe(0);
      }
    }
  });
});
