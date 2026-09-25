/**
 * Environment Utilities — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  getEnvironment,
  isFacebookPublishEnabled,
  isProduction,
  isDevelopment,
} from '../../src/core/environment';

describe('getEnvironment', () => {
  it('should return development for undefined', () => {
    expect(getEnvironment(undefined)).toBe('development');
  });

  it('should return development for empty string', () => {
    expect(getEnvironment('')).toBe('development');
  });

  it('should return valid environments correctly', () => {
    expect(getEnvironment('development')).toBe('development');
    expect(getEnvironment('staging')).toBe('staging');
    expect(getEnvironment('production')).toBe('production');
  });

  it('should default to development for unknown values', () => {
    expect(getEnvironment('invalid')).toBe('development');
    expect(getEnvironment('prod')).toBe('development');
  });
});

describe('isFacebookPublishEnabled', () => {
  it('should return false in development even if flag is true', () => {
    expect(isFacebookPublishEnabled('true', 'development')).toBe(false);
  });

  it('should return false in staging even if flag is true', () => {
    expect(isFacebookPublishEnabled('true', 'staging')).toBe(false);
  });

  it('should return false in production if flag is not true', () => {
    expect(isFacebookPublishEnabled('false', 'production')).toBe(false);
    expect(isFacebookPublishEnabled(undefined, 'production')).toBe(false);
    expect(isFacebookPublishEnabled('', 'production')).toBe(false);
  });

  it('should return true ONLY in production with flag explicitly true', () => {
    expect(isFacebookPublishEnabled('true', 'production')).toBe(true);
  });
});

describe('isProduction', () => {
  it('should return true only for production', () => {
    expect(isProduction('production')).toBe(true);
    expect(isProduction('staging')).toBe(false);
    expect(isProduction('development')).toBe(false);
  });
});

describe('isDevelopment', () => {
  it('should return true only for development', () => {
    expect(isDevelopment('development')).toBe(true);
    expect(isDevelopment('staging')).toBe(false);
    expect(isDevelopment('production')).toBe(false);
  });
});
