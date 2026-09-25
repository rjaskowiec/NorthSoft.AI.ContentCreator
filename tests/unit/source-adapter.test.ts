import { describe, expect, it } from 'vitest';
import {
  normalizeCanonicalUrl,
  RssSourceAdapter,
  sanitizeHtmlText,
} from '../../src/services/research/source-adapter';

describe('Research Source Adapter', () => {
  it('normalizes canonical URLs by stripping tracking params and fragments', () => {
    const rawUrl =
      'https://blog.cloudflare.com/new-feature/?utm_source=twitter&utm_medium=social&fbclid=xyz#section1';
    const normalized = normalizeCanonicalUrl(rawUrl);

    expect(normalized).toBe('https://blog.cloudflare.com/new-feature');
  });

  it('sanitizes HTML tags and unescapes entities', () => {
    const html = '<p>Cloudflare &amp; AI <strong>Announcement</strong></p>';
    const sanitized = sanitizeHtmlText(html);

    expect(sanitized).toBe('Cloudflare & AI Announcement');
  });

  it('parses RSS 2.0 feed XML correctly', async () => {
    const sampleRss = `
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item>
            <title><![CDATA[New Cloudflare Security Shield Released]]></title>
            <link>https://blog.cloudflare.com/security-shield/?utm_source=rss</link>
            <description><![CDATA[<p>Today we announce a new security feature for Workers.</p>]]></description>
            <pubDate>Fri, 25 Sep 2026 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;

    const adapter = new RssSourceAdapter();
    const items = await adapter.parseFeedXml(sampleRss, 'src-1');

    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('New Cloudflare Security Shield Released');
    expect(items[0]!.url).toBe('https://blog.cloudflare.com/security-shield');
    expect(items[0]!.urlHash).toHaveLength(64); // SHA-256 hash
    expect(items[0]!.summary).toContain('Today we announce a new security feature');
  });

  it('parses Atom feed XML correctly', async () => {
    const sampleAtom = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>GitHub Engineering</title>
        <entry>
          <title>Building Scalable AI Coding Agents</title>
          <link href="https://github.blog/engineering/ai-agents/"/>
          <summary>How GitHub built scalable infrastructure for coding assistants.</summary>
          <published>2026-09-25T14:30:00Z</published>
        </entry>
      </feed>
    `;

    const adapter = new RssSourceAdapter();
    const items = await adapter.parseFeedXml(sampleAtom, 'src-2');

    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Building Scalable AI Coding Agents');
    expect(items[0]!.url).toBe('https://github.blog/engineering/ai-agents');
    expect(items[0]!.urlHash).toHaveLength(64);
  });
});
