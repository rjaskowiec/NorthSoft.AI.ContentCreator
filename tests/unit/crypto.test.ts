import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  generateRandomToken,
  generateSalt,
  hexToBytes,
  hashPassword,
  hashToken,
  timingSafeEqual,
  verifyPassword,
} from '../../src/core/auth/crypto';

describe('Auth Cryptography', () => {
  it('converts between bytes and hex correctly', () => {
    const original = new Uint8Array([0, 15, 255, 128, 64]);
    const hex = bytesToHex(original);
    expect(hex).toBe('000fff8040');
    const restored = hexToBytes(hex);
    expect(restored).toEqual(original);
  });

  it('throws error for invalid hex length', () => {
    expect(() => hexToBytes('abc')).toThrow('Invalid hex string');
  });

  it('generates random salt and tokens with correct lengths', () => {
    const salt = generateSalt(16);
    expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars

    const token = generateRandomToken(32);
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it('hashes and verifies passwords correctly', async () => {
    const password = 'SuperSecretPassword123!';
    const salt = generateSalt(16);

    const hash = await hashPassword(password, salt, 1000); // 1000 iterations for test speed
    expect(hash).toBeDefined();
    expect(hash).toHaveLength(64);

    const isValid = await verifyPassword(password, salt, hash, 1000);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword', salt, hash, 1000);
    expect(isInvalid).toBe(false);
  });

  it('produces distinct hashes for different salts', async () => {
    const password = 'SamePassword';
    const salt1 = generateSalt(16);
    const salt2 = generateSalt(16);

    const hash1 = await hashPassword(password, salt1, 1000);
    const hash2 = await hashPassword(password, salt2, 1000);

    expect(hash1).not.toBe(hash2);
  });

  it('hashes session tokens deterministically', async () => {
    const token = 'session-token-xyz-123';
    const hash1 = await hashToken(token);
    const hash2 = await hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it('compares strings in constant time', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true);
    expect(timingSafeEqual('hello', 'world')).toBe(false);
    expect(timingSafeEqual('hello', 'hell')).toBe(false);
  });
});
