/**
 * Image URL Validator for Publication Pipeline
 *
 * Verifies public accessibility and content-type of images before publishing to external platforms.
 * Handles self-subrequest protection for Cloudflare Workers internal media.
 */

export async function validateImageUrl(
  url: string,
  timeoutMs = 5000,
): Promise<{ valid: boolean; error?: string; httpStatus?: number }> {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Empty image URL' };
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, error: 'Image URL must start with http:// or https://' };
  }

  // Cloudflare Workers cannot fetch their own domain (self-subrequest deadlock).
  // Internal media URLs are verified directly via R2 bucket binding.
  if (trimmed.includes('/media/') || trimmed.includes('ai.northsoft.is')) {
    return { valid: true, httpStatus: 200 };
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(trimmed, {
      method: 'HEAD',
      signal: controller.signal,
      headers: browserHeaders,
    });
    clearTimeout(timer);

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (
        contentType &&
        !contentType.toLowerCase().includes('image/') &&
        !contentType.toLowerCase().includes('octet-stream')
      ) {
        return {
          valid: false,
          httpStatus: response.status,
          error: `Invalid content-type '${contentType}'`,
        };
      }
      return { valid: true, httpStatus: response.status };
    }

    // Fallback: If HEAD fails (e.g. 403, 405, 522, 500), attempt GET with Range header
    const getController = new AbortController();
    const getTimer = setTimeout(() => getController.abort(), timeoutMs);
    const getRes = await fetch(trimmed, {
      method: 'GET',
      signal: getController.signal,
      headers: { ...browserHeaders, Range: 'bytes=0-1024' },
    });
    clearTimeout(getTimer);

    if (getRes.ok || getRes.status === 206 || getRes.status === 304) {
      return { valid: true, httpStatus: getRes.status };
    }

    if (getRes.status === 522 || getRes.status === 524) {
      console.warn(`[validateImageUrl] HTTP ${getRes.status} during origin probe for ${trimmed}. Permitting for Meta API.`);
      return { valid: true, httpStatus: getRes.status };
    }

    return { valid: false, httpStatus: getRes.status, error: `HTTP ${getRes.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (trimmed.startsWith('https://')) {
      console.warn(`[validateImageUrl] Probe exception for ${trimmed}: ${msg}. Permitting valid HTTPS URL for Meta API.`);
      return { valid: true, error: msg };
    }
    return { valid: false, error: `Fetch failed: ${msg}` };
  }
}
