/**
 * NorthSoft.AI.ContentCreator — Research Source Adapters
 *
 * Implements pluggable source adapters (RSS, Atom, JSON API) for retrieving
 * external research material with URL normalization and deduplication hashing.
 */

import { hashToken } from '../../core/auth/crypto';
import { safeFetch } from '../../core/security/ssrf';

export interface ResearchSourceRecord {
  id: string;
  name: string;
  url: string;
  type: string; // rss | api | json
  category: string;
  enabled: number;
  priority: number;
  last_checked_at: string | null;
  last_status: string;
  last_error: string | null;
}

export interface RawResearchItem {
  sourceId: string;
  title: string;
  url: string;
  urlHash: string;
  summary: string;
  publishedAt: string;
}

export interface IResearchSourceAdapter {
  fetchItems(source: ResearchSourceRecord): Promise<RawResearchItem[]>;
}

/**
 * Normalizes a URL by removing trailing slashes, tracking parameters (utm_*), and lowercase scheme/host.
 */
export function normalizeCanonicalUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl.trim());
    url.hash = ''; // Remove fragment

    // Remove tracking query parameters
    const paramsToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (
        key.startsWith('utm_') ||
        key === 'fbclid' ||
        key === 'gclid' ||
        key === 'mc_eid' ||
        key === 'ref'
      ) {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach((key) => url.searchParams.delete(key));

    let href = url.toString();
    if (href.endsWith('/') && url.pathname !== '/') {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Strips HTML tags and unescapes common HTML entities in text content.
 */
export function sanitizeHtmlText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * RSS and Atom Feed Adapter compatible with Cloudflare Workers.
 */
export class RssSourceAdapter implements IResearchSourceAdapter {
  async fetchItems(source: ResearchSourceRecord): Promise<RawResearchItem[]> {
    const response = await safeFetch(source.url, {
      timeoutMs: 12000,
      maxSizeBytes: 2 * 1024 * 1024,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching feed ${source.url}`);
    }

    const xmlText = await response.text();
    return await this.parseFeedXml(xmlText, source.id);
  }

  async parseFeedXml(xmlText: string, sourceId: string): Promise<RawResearchItem[]> {
    const items: RawResearchItem[] = [];

    // Parse RSS <item> tags
    const rssItemMatches = xmlText.match(/<item[\s>].*?<\/item>/gs);
    if (rssItemMatches && rssItemMatches.length > 0) {
      for (const itemXml of rssItemMatches.slice(0, 15)) {
        const titleMatch = itemXml.match(/<title>(.*?)<\/title>/s);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/s);
        const descMatch = itemXml.match(/<(description|content:encoded)>(.*?)<\/\1>/s);
        const dateMatch = itemXml.match(/<(pubDate|dc:date)>(.*?)<\/\1>/s);

        const rawTitle = titleMatch?.[1] ?? '';
        const rawLink = linkMatch?.[1] ?? '';
        const rawDesc = descMatch?.[2] ?? '';
        const rawDate = dateMatch?.[2] ?? '';

        const title = sanitizeHtmlText(rawTitle);
        const canonicalUrl = normalizeCanonicalUrl(sanitizeHtmlText(rawLink));
        const summary = sanitizeHtmlText(rawDesc).substring(0, 1000);

        if (title && canonicalUrl) {
          const urlHash = await hashToken(canonicalUrl);
          const publishedAt = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();

          items.push({
            sourceId,
            title,
            url: canonicalUrl,
            urlHash,
            summary,
            publishedAt,
          });
        }
      }
      return items;
    }

    // Parse Atom <entry> tags fallback
    const atomEntryMatches = xmlText.match(/<entry[\s>].*?<\/entry>/gs);
    if (atomEntryMatches && atomEntryMatches.length > 0) {
      for (const entryXml of atomEntryMatches.slice(0, 15)) {
        const titleMatch = entryXml.match(/<title.*?>(.*?)<\/title>/s);
        const linkMatch = entryXml.match(/<link\s+[^>]*href=["']([^"']+)["']/s);
        const summaryMatch = entryXml.match(/<(summary|content).*?>(.*?)<\/\1>/s);
        const dateMatch = entryXml.match(/<(published|updated)>(.*?)<\/\1>/s);

        const title = sanitizeHtmlText(titleMatch?.[1] ?? '');
        const canonicalUrl = normalizeCanonicalUrl(linkMatch?.[1] ?? '');
        const summary = sanitizeHtmlText(summaryMatch?.[2] ?? '').substring(0, 1000);

        if (title && canonicalUrl) {
          const urlHash = await hashToken(canonicalUrl);
          const publishedAt =
            dateMatch && dateMatch[2]
              ? new Date(dateMatch[2]).toISOString()
              : new Date().toISOString();

          items.push({
            sourceId,
            title,
            url: canonicalUrl,
            urlHash,
            summary,
            publishedAt,
          });
        }
      }
    }

    return items;
  }
}
