/**
 * NorthSoft.AI.ContentCreator — SSRF (Server-Side Request Forgery) Protection
 *
 * Validates external research URLs before performing HTTP fetch calls.
 * Blocks private IP ranges, localhost, cloud metadata endpoints, unsupported protocols,
 * and enforces strict request size/timeout limits.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254', // AWS/GCP/Azure Metadata Endpoint
  'instance-data',
  'metadata.google.internal',
]);

/**
 * Checks if an IP address string belongs to a private, loopback, or link-local range.
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 Loopback (127.0.0.0/8)
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv4 Private Range A (10.0.0.0/8)
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv4 Private Range B (172.16.0.0/12: 172.16.0.0 to 172.31.255.255)
  const matchB = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (matchB && matchB[1]) {
    const secondOctet = parseInt(matchB[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // IPv4 Private Range C (192.168.0.0/16)
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv4 Link-Local / Cloud Metadata (169.254.0.0/16)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv4 Current Network / Broadcast
  if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;

  // IPv6 Loopback / Link-Local / Unique Local
  if (ip === '::1' || ip === '::' || /^fe80:/i.test(ip) || /^fd[0-9a-f]{2}:/i.test(ip)) return true;

  return false;
}

/**
 * Validates a target URL against SSRF safety rules.
 * Throws an Error if the URL is invalid or unsafe.
 */
export function validateUrlForSsrf(urlString: string): URL {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('SSRF Protection: URL must be a non-empty string');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error('SSRF Protection: Malformed URL');
  }

  // 1. Protocol Validation
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(
      `SSRF Protection: Unsupported protocol "${parsedUrl.protocol}". Only HTTP(S) allowed.`,
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase().trim();

  // 2. Hostname Blacklist
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`SSRF Protection: Access to blocked host "${hostname}" is prohibited`);
  }

  // 3. Internal TLD / Hostname Checks
  if (
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.lan')
  ) {
    throw new Error(`SSRF Protection: Access to internal domain "${hostname}" is prohibited`);
  }

  // 4. IP Address Validation
  if (isPrivateIp(hostname)) {
    throw new Error(`SSRF Protection: Access to private IP address "${hostname}" is prohibited`);
  }

  return parsedUrl;
}

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxSizeBytes?: number;
}

/**
 * Wraps native fetch with SSRF validation, timeout abort controller, and response size bounds.
 */
export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const validatedUrl = validateUrlForSsrf(urlString);

  const timeoutMs = options.timeoutMs || 10000; // Default 10s
  const maxSizeBytes = options.maxSizeBytes || 2 * 1024 * 1024; // Default 2MB limit

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validatedUrl.toString(), {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'NorthSoft-AI-ResearchBot/1.0 (+https://ai.northsoft.is)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeoutId);

    // Check response Content-Length if present
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      throw new Error(
        `SSRF Protection: Response size (${contentLength} bytes) exceeds limit of ${maxSizeBytes} bytes`,
      );
    }

    return response;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`SSRF Protection: Request timed out after ${timeoutMs}ms`, { cause: err });
    }
    throw err;
  }
}
