/**
 * NorthSoft.AI.ContentCreator — Auth Cryptography Utilities
 *
 * Provides Web Crypto API based password hashing, random token generation,
 * session token hashing, and timing-safe comparisons.
 * Compatible with Cloudflare Workers standard Web Crypto implementation.
 */

const DEFAULT_ITERATIONS = 60000;
const KEY_LENGTH_BITS = 256;

/**
 * Converts Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates cryptographically secure random salt (hex string).
 */
export function generateSalt(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Generates a non-guessable random token (hex string).
 */
export function generateRandomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Hashes a password using PBKDF2-HMAC-SHA256.
 */
export async function hashPassword(
  password: string,
  saltHex: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = hexToBytes(saltHex);

  const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, [
    'deriveBits',
  ]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_LENGTH_BITS,
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Verifies a password against an expected hash using constant-time comparison.
 */
export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHashHex: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<boolean> {
  const computedHashHex = await hashPassword(password, saltHex, iterations);
  return timingSafeEqual(computedHashHex, expectedHashHex);
}

/**
 * Computes SHA-256 hash of a string (e.g. session token).
 * Used so session tokens are never stored plaintext in database.
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Performs timing-safe constant time comparison of two strings.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    const aVal = aBytes[i] ?? 0;
    const bVal = bBytes[i] ?? 0;
    result |= aVal ^ bVal;
  }

  return result === 0;
}
