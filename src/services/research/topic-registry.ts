/**
 * NorthSoft.AI.ContentCreator — Topic Registry & Cooldown Manager
 *
 * Tracks topic angle history, calculates angle similarity, enforces topic cooldowns
 * (cooldown on identical angles, NOT broad pillar blocks), and calculates intelligent
 * suggested_publish_date values to interleave content pillars.
 */

import type { ContentPillar } from './taxonomy';

export interface TopicHistoryRecord {
  id: string;
  idea_id?: string;
  post_id?: string;
  content_pillar: ContentPillar;
  content_angle: string;
  title: string;
  status: 'queued' | 'scheduled' | 'published' | 'expired';
  suggested_publish_date?: string;
  published_at?: string;
  created_at: string;
}

export class TopicRegistry {
  constructor(private db: D1Database) {}

  /**
   * Checks if a proposed content angle is too similar to an existing angle in topic history.
   * Returns true if duplicate angle within cooldown period (default 7 days).
   */
  static isDuplicateAngle(newAngle: string, existingAngles: string[]): boolean {
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3);

    const newTokens = new Set(normalize(newAngle));
    if (newTokens.size === 0) return false;

    for (const existing of existingAngles) {
      const existingTokens = new Set(normalize(existing));
      if (existingTokens.size === 0) continue;

      let overlapCount = 0;
      for (const token of newTokens) {
        if (existingTokens.has(token)) {
          overlapCount++;
        }
      }

      const similarity = overlapCount / Math.min(newTokens.size, existingTokens.size);
      if (similarity >= 0.7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Fetches recent topic history from D1 database.
   */
  async getRecentTopicHistory(days = 14): Promise<TopicHistoryRecord[]> {
    try {
      const res = await this.db
        .prepare(
          `SELECT id, idea_id, post_id, content_pillar, content_angle, title, status, suggested_publish_date, published_at, created_at
           FROM content_topic_history
           WHERE created_at >= datetime('now', '-' || ? || ' days') OR status IN ('queued', 'scheduled')
           ORDER BY created_at DESC`,
        )
        .bind(days)
        .all<TopicHistoryRecord>();
      return res.results || [];
    } catch {
      return [];
    }
  }

  /**
   * Calculates an intelligent suggested_publish_date for a new content idea.
   * Ensures pillar interleaving and respects angle cooldowns.
   */
  calculateSuggestedPublishDate(
    pillar: ContentPillar,
    angle: string,
    history: TopicHistoryRecord[],
    baseDate = new Date(),
  ): { suggestedDate: string; isDuplicateAngle: boolean; cooldownApplied: boolean } {
    // 1. Check for Duplicate Angle in History
    const recentAngles = history
      .filter((h) => {
        const createdTime = new Date(h.created_at).getTime();
        const cutoff = baseDate.getTime() - 7 * 24 * 60 * 60 * 1000;
        return createdTime >= cutoff || h.status === 'queued' || h.status === 'scheduled';
      })
      .map((h) => `${h.title} ${h.content_angle}`);

    const duplicateAngle = TopicRegistry.isDuplicateAngle(angle, recentAngles);

    // 2. Find Next Available Date Slot
    // Target: 1 post per day, interleaving pillars
    let candidateOffset = 0;
    let foundSlot = false;

    // Map of existing assigned dates (YYYY-MM-DD -> list of pillars assigned)
    const assignedSlots: Record<string, ContentPillar[]> = {};
    for (const item of history) {
      const dateStr = item.suggested_publish_date
        ? item.suggested_publish_date.split('T')[0]
        : item.created_at.split('T')[0];
      if (dateStr) {
        if (!assignedSlots[dateStr]) assignedSlots[dateStr] = [];
        assignedSlots[dateStr].push(item.content_pillar);
      }
    }

    let targetDate = new Date(baseDate.getTime());

    while (!foundSlot && candidateOffset < 30) {
      targetDate = new Date(baseDate.getTime() + candidateOffset * 24 * 60 * 60 * 1000);
      const dateKey = targetDate.toISOString().split('T')[0]!;
      const pillarsOnDate = assignedSlots[dateKey] || [];

      // Slot is good if:
      // a) No posts yet assigned on this day OR
      // b) Day has fewer than 1 post AND does not contain the SAME pillar
      if (pillarsOnDate.length === 0) {
        foundSlot = true;
      } else if (!pillarsOnDate.includes(pillar) && candidateOffset > 0) {
        foundSlot = true;
      } else {
        candidateOffset++;
      }
    }

    if (duplicateAngle) {
      // Cooldown penalty: Push out by an extra 7 days if duplicate angle
      targetDate = new Date(targetDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    targetDate.setUTCHours(9, 0, 0, 0);

    return {
      suggestedDate: targetDate.toISOString(),
      isDuplicateAngle: duplicateAngle,
      cooldownApplied: duplicateAngle,
    };
  }

  /**
   * Registers a new content topic entry in database.
   */
  async recordTopicHistory(entry: {
    id?: string;
    idea_id?: string;
    post_id?: string;
    content_pillar: ContentPillar;
    content_angle: string;
    title: string;
    status?: 'queued' | 'scheduled' | 'published' | 'expired';
    suggested_publish_date?: string;
  }): Promise<string> {
    const id = entry.id || crypto.randomUUID();
    const nowIso = new Date().toISOString();
    try {
      await this.db
        .prepare(
          `INSERT INTO content_topic_history (
            id, idea_id, post_id, content_pillar, content_angle, title, status, suggested_publish_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          entry.idea_id || null,
          entry.post_id || null,
          entry.content_pillar,
          entry.content_angle,
          entry.title,
          entry.status || 'queued',
          entry.suggested_publish_date || null,
          nowIso,
        )
        .run();
    } catch {
      // Ignore if table schema fallback in tests
    }
    return id;
  }
}
