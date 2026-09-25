/**
 * Quality Gate — Unit Tests
 *
 * Tests the core quality gate evaluation logic to ensure:
 * - Critical check failures always block publication
 * - Score thresholds are enforced
 * - Edge cases are handled safely
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateQualityGate,
  CRITICAL_BLOCKING_CHECKS,
  MIN_QUALITY_SCORE,
  type QualityGateResult,
  type QualityChecks,
} from '../../src/core/quality-gate';

function makePassingChecks(): QualityChecks {
  return {
    factual_accuracy: 'PASS',
    source_support: 'PASS',
    hallucination: 'PASS',
    brand_voice: 'PASS',
    grammar: 'PASS',
    relevance: 'PASS',
    spam: 'PASS',
    engagement_bait: 'PASS',
    policy_risk: 'PASS',
    copyright_risk: 'PASS',
  };
}

function makeResult(overrides: Partial<QualityGateResult> = {}): QualityGateResult {
  return {
    decision: 'PASS',
    score: 95,
    checks: makePassingChecks(),
    issues: [],
    required_changes: [],
    reviewedAt: new Date().toISOString(),
    reviewerModel: 'test-model',
    reviewerProvider: 'test-provider',
    attemptNumber: 1,
    ...overrides,
  };
}

describe('evaluateQualityGate', () => {
  it('should return PASS when all checks pass and score is above threshold', () => {
    const result = makeResult();
    expect(evaluateQualityGate(result)).toBe('PASS');
  });

  it('should return PASS with minimum acceptable score', () => {
    const result = makeResult({ score: MIN_QUALITY_SCORE });
    expect(evaluateQualityGate(result)).toBe('PASS');
  });

  it('should return FAIL when score is below threshold', () => {
    const result = makeResult({ score: MIN_QUALITY_SCORE - 1 });
    expect(evaluateQualityGate(result)).toBe('FAIL');
  });

  it('should return FAIL with score of 0', () => {
    const result = makeResult({ score: 0 });
    expect(evaluateQualityGate(result)).toBe('FAIL');
  });

  // Test each critical blocking check
  for (const criticalCheck of CRITICAL_BLOCKING_CHECKS) {
    it(`should return BLOCKED when critical check "${criticalCheck}" fails`, () => {
      const checks = makePassingChecks();
      checks[criticalCheck] = 'FAIL';
      const result = makeResult({ checks, score: 100 });
      expect(evaluateQualityGate(result)).toBe('BLOCKED');
    });
  }

  it('should return BLOCKED even with perfect score if critical check fails', () => {
    const checks = makePassingChecks();
    checks.factual_accuracy = 'FAIL';
    const result = makeResult({ checks, score: 100 });
    expect(evaluateQualityGate(result)).toBe('BLOCKED');
  });

  it('should return FAIL when a non-critical check fails', () => {
    const checks = makePassingChecks();
    checks.brand_voice = 'FAIL';
    const result = makeResult({ checks, score: 90 });
    expect(evaluateQualityGate(result)).toBe('FAIL');
  });

  it('should treat WARNING as non-blocking', () => {
    const checks = makePassingChecks();
    checks.brand_voice = 'WARNING';
    checks.grammar = 'WARNING';
    const result = makeResult({ checks });
    expect(evaluateQualityGate(result)).toBe('PASS');
  });

  it('should treat SKIPPED as non-blocking', () => {
    const checks = makePassingChecks();
    checks.engagement_bait = 'SKIPPED';
    const result = makeResult({ checks });
    expect(evaluateQualityGate(result)).toBe('PASS');
  });
});
