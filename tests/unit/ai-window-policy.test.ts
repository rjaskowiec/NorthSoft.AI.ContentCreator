/**
 * NorthSoft.AI.ContentCreator — AI Background Window Policy Tests
 */

import { describe, expect, it } from 'vitest';
import {
  isWithinAiBackgroundWindow,
  isAiExecutionPermitted,
  AI_BACKGROUND_WINDOW,
} from '../../src/core/ai-window-policy';

describe('AI Background Execution Window Policy', () => {
  describe('isWithinAiBackgroundWindow', () => {
    it('returns false before the evening window (17:59 UTC)', () => {
      const date = new Date('2026-09-28T17:59:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });

    it('returns true at the start of the evening window (18:00 UTC)', () => {
      const date = new Date('2026-09-28T18:00:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(true);
    });

    it('returns true mid-window (22:00 UTC)', () => {
      const date = new Date('2026-09-28T22:00:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(true);
    });

    it('returns true one minute before cutoff (23:29 UTC)', () => {
      const date = new Date('2026-09-28T23:29:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(true);
    });

    it('returns true at exact cutoff (23:30 UTC)', () => {
      const date = new Date('2026-09-28T23:30:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(true);
    });

    it('returns false after cutoff (23:31 UTC)', () => {
      const date = new Date('2026-09-28T23:31:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });

    it('returns false right before midnight (23:59 UTC)', () => {
      const date = new Date('2026-09-28T23:59:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });

    it('returns false at midnight (00:00 UTC)', () => {
      const date = new Date('2026-09-28T00:00:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });

    it('returns false early morning (04:00 UTC)', () => {
      const date = new Date('2026-09-28T04:00:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });

    it('returns false at noon (12:00 UTC)', () => {
      const date = new Date('2026-09-28T12:00:00Z');
      expect(isWithinAiBackgroundWindow(date)).toBe(false);
    });
  });

  describe('isAiExecutionPermitted for Manual vs Cron triggers', () => {
    it('permits manual admin actions at 04:00 UTC', () => {
      const date = new Date('2026-09-28T04:00:00Z');
      expect(isAiExecutionPermitted('manual', date)).toBe(true);
      expect(isAiExecutionPermitted('admin', date)).toBe(true);
    });

    it('permits manual admin actions at 12:00 UTC', () => {
      const date = new Date('2026-09-28T12:00:00Z');
      expect(isAiExecutionPermitted('manual', date)).toBe(true);
    });

    it('permits manual admin actions at 17:00 UTC', () => {
      const date = new Date('2026-09-28T17:00:00Z');
      expect(isAiExecutionPermitted('manual', date)).toBe(true);
    });

    it('permits manual admin actions at 23:59 UTC', () => {
      const date = new Date('2026-09-28T23:59:00Z');
      expect(isAiExecutionPermitted('manual', date)).toBe(true);
    });

    it('defers automated cron actions outside window (04:00 UTC)', () => {
      const date = new Date('2026-09-28T04:00:00Z');
      expect(isAiExecutionPermitted('cron', date)).toBe(false);
    });

    it('permits automated cron actions inside window (19:30 UTC)', () => {
      const date = new Date('2026-09-28T19:30:00Z');
      expect(isAiExecutionPermitted('cron', date)).toBe(true);
    });
  });

  describe('Boundary and configuration constants', () => {
    it('defines start at 18:00 and end at 23:30 UTC', () => {
      expect(AI_BACKGROUND_WINDOW.START_HOUR_UTC).toBe(18);
      expect(AI_BACKGROUND_WINDOW.START_MINUTE_UTC).toBe(0);
      expect(AI_BACKGROUND_WINDOW.END_HOUR_UTC).toBe(23);
      expect(AI_BACKGROUND_WINDOW.END_MINUTE_UTC).toBe(30);
    });
  });
});
