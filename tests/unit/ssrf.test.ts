import { describe, expect, it } from 'vitest';
import { isPrivateIp, validateUrlForSsrf } from '../../src/core/security/ssrf';

describe('SSRF Protection', () => {
  it('detects private and loopback IP addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.100')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('0.0.0.0')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);

    // Public IPs should be allowed
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('104.16.123.96')).toBe(false);
  });

  it('allows safe public HTTPS URLs', () => {
    const url = validateUrlForSsrf('https://blog.cloudflare.com/rss/');
    expect(url.hostname).toBe('blog.cloudflare.com');
    expect(url.protocol).toBe('https:');
  });

  it('rejects unsupported protocols', () => {
    expect(() => validateUrlForSsrf('file:///etc/passwd')).toThrow('Unsupported protocol');
    expect(() => validateUrlForSsrf('ftp://speedtest.tele2.net')).toThrow('Unsupported protocol');
    expect(() => validateUrlForSsrf('gopher://127.0.0.1')).toThrow('Unsupported protocol');
  });

  it('rejects localhost, loopback, and metadata hostnames', () => {
    expect(() => validateUrlForSsrf('https://localhost/admin')).toThrow('Access to blocked host');
    expect(() => validateUrlForSsrf('http://127.0.0.1:8080')).toThrow('Access to blocked host');
    expect(() => validateUrlForSsrf('http://169.254.169.254/latest/meta-data/')).toThrow(
      'Access to blocked host',
    );
    expect(() => validateUrlForSsrf('http://metadata.google.internal/computeMetadata')).toThrow(
      'Access to blocked host',
    );
  });

  it('rejects private IPv4 addresses', () => {
    expect(() => validateUrlForSsrf('http://10.0.0.1/status')).toThrow('private IP address');
    expect(() => validateUrlForSsrf('http://192.168.1.1/router')).toThrow('private IP address');
    expect(() => validateUrlForSsrf('http://172.20.0.5/api')).toThrow('private IP address');
  });

  it('rejects internal top-level domains', () => {
    expect(() => validateUrlForSsrf('https://database.internal/query')).toThrow(
      'Access to internal domain',
    );
    expect(() => validateUrlForSsrf('http://printer.local/print')).toThrow(
      'Access to internal domain',
    );
  });
});
