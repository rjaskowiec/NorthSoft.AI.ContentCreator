/**
 * Quality Gate Types
 *
 * Defines the structured QA result format and quality gate logic.
 * The quality gate is the final checkpoint before content may be published.
 *
 * Rules:
 * - Score alone does NOT determine pass/fail.
 * - Certain critical checks always block publication regardless of score.
 * - The gate must be explicit and auditable.
 */

/**
 * Result of an individual quality check.
 */
export type CheckResult = 'PASS' | 'FAIL' | 'WARNING' | 'SKIPPED';

/**
 * Overall quality gate decision.
 */
export type QualityDecision = 'PASS' | 'FAIL' | 'BLOCKED';

/**
 * Individual check results from AI-based quality assessment.
 */
export interface QualityChecks {
  factual_accuracy: CheckResult;
  source_support: CheckResult;
  hallucination: CheckResult;
  brand_voice: CheckResult;
  grammar: CheckResult;
  relevance: CheckResult;
  spam: CheckResult;
  engagement_bait: CheckResult;
  policy_risk: CheckResult;
  copyright_risk: CheckResult;
}

/**
 * Issue found during quality review.
 */
export interface QualityIssue {
  check: keyof QualityChecks;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestion?: string;
}

/**
 * Structured QA result as specified in the architecture.
 */
export interface QualityGateResult {
  decision: QualityDecision;
  score: number;
  checks: QualityChecks;
  issues: QualityIssue[];
  required_changes: string[];
  reviewedAt: string;
  reviewerModel: string;
  reviewerProvider: string;
  attemptNumber: number;
}

/**
 * Checks that ALWAYS block publication regardless of overall score.
 * These represent critical safety and compliance failures.
 */
export const CRITICAL_BLOCKING_CHECKS: (keyof QualityChecks)[] = [
  'factual_accuracy',
  'hallucination',
  'policy_risk',
  'copyright_risk',
  'spam',
];

/**
 * Maximum number of regeneration attempts before permanent BLOCKED status.
 */
export const MAX_REGENERATION_ATTEMPTS = 3;

/**
 * Minimum score required to pass the quality gate.
 * Even if all individual checks pass, a low aggregate score blocks publication.
 */
export const MIN_QUALITY_SCORE = 70;

/**
 * Evaluate whether a quality gate result constitutes a pass.
 * This is the ONLY function that should determine publication eligibility.
 */
export function evaluateQualityGate(result: QualityGateResult): QualityDecision {
  // Any critical check failure always blocks
  for (const check of CRITICAL_BLOCKING_CHECKS) {
    if (result.checks[check] === 'FAIL') {
      return 'BLOCKED';
    }
  }

  // Score too low
  if (result.score < MIN_QUALITY_SCORE) {
    return 'FAIL';
  }

  // Any non-critical failure
  const hasFailures = Object.values(result.checks).some((v) => v === 'FAIL');
  if (hasFailures) {
    return 'FAIL';
  }

  return 'PASS';
}
