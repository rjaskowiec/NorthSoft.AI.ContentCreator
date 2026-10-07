/**
 * NorthSoft.AI.ContentCreator — Topic Registry & Cooldown Manager
 *
 * Tracks topic angle history, calculates angle similarity, enforces topic cooldowns
 * (cooldown on identical angles, NOT broad pillar blocks), and calculates intelligent
 * suggested_publish_date values to interleave content pillars.
 */

import {
  type ContentPillar,
  type TopicClusterKey,
  TOPIC_CLUSTERS,
  getNeighborClusters,
} from './taxonomy';

export interface TopicHistoryRecord {
  id: string;
  idea_id?: string;
  post_id?: string;
  content_pillar: ContentPillar;
  content_angle: string;
  title: string;
  cluster_key?: string;
  status: 'queued' | 'scheduled' | 'published' | 'expired';
  suggested_publish_date?: string;
  published_at?: string;
  created_at: string;
}

export class TopicRegistry {
  constructor(private db: D1Database) {}

  /**
   * Checks if a proposed content title/angle is too similar to an existing entry in topic history.
   * Detects exact matches, normalized token overlaps, bigrams, and near-duplicates.
   */
  static isDuplicateAngle(newText: string, existingTexts: string[]): boolean {
    if (!newText || !existingTexts || existingTexts.length === 0) return false;

    const STOP_WORDS = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'for',
      'to',
      'in',
      'on',
      'at',
      'with',
      'by',
      'from',
      'how',
      'why',
      'what',
      'your',
      'you',
      'is',
      'are',
      'this',
      'that',
      'can',
      'help',
      'of',
      'jak',
      'dlaczego',
      'co',
      'czy',
      'twoja',
      'twojej',
      'twojego',
      'dla',
      'jest',
      'sa',
      'moze',
      'pomoc',
      'dzieki',
      'dzięki',
      'razem',
      'miejsce',
      'miejscu',
      'zespół',
      'zespole',
      'jeden',
      'jednym',
    ]);

    const stemWord = (w: string) => {
      let stemmed = w;
      if (stemmed.endsWith('ing') && stemmed.length > 5) stemmed = stemmed.slice(0, -3);
      else if (stemmed.endsWith('es') && stemmed.length > 4) stemmed = stemmed.slice(0, -2);
      else if (stemmed.endsWith('s') && !stemmed.endsWith('ss') && stemmed.length > 3)
        stemmed = stemmed.slice(0, -1);
      else if (stemmed.endsWith('ed') && stemmed.length > 4) stemmed = stemmed.slice(0, -2);
      return stemmed;
    };

    const getTokens = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
        .map(stemWord);

    const getBigrams = (tokens: string[]) => {
      const bigrams: string[] = [];
      for (let i = 0; i < tokens.length - 1; i++) {
        bigrams.push(`${tokens[i]}_${tokens[i + 1]}`);
      }
      return bigrams;
    };

    const newNorm = newText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const newTokens = getTokens(newText);
    if (newTokens.length === 0) return false;
    const newBigrams = new Set(getBigrams(newTokens));

    for (const existing of existingTexts) {
      if (!existing) continue;
      const existingNorm = existing.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (newNorm === existingNorm) return true;

      const existingTokens = getTokens(existing);
      if (existingTokens.length === 0) continue;

      // 1. Unigram Token Overlap Ratio
      const tokenSetA = new Set(newTokens);
      const tokenSetB = new Set(existingTokens);
      let commonTokens = 0;
      for (const t of tokenSetA) {
        if (tokenSetB.has(t)) commonTokens++;
      }
      const minTokens = Math.min(tokenSetA.size, tokenSetB.size);
      const tokenOverlap = minTokens > 0 ? commonTokens / minTokens : 0;

      // 2. Bigram Overlap Ratio
      const existingBigrams = new Set(getBigrams(existingTokens));
      let commonBigrams = 0;
      for (const b of newBigrams) {
        if (existingBigrams.has(b)) commonBigrams++;
      }
      const minBigrams = Math.min(newBigrams.size, existingBigrams.size);
      const bigramOverlap = minBigrams > 0 ? commonBigrams / minBigrams : 0;

      // Duplicate detected if high token overlap (>= 0.5) OR bigram overlap (>= 0.33)
      if (tokenOverlap >= 0.5 || (bigramOverlap >= 0.33 && commonBigrams >= 1)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluates Topic Cluster Memory / Topic Fatigue.
   * Enforces a cooldown (default 21 days) on identical clusters,
   * and a family cooldown (default 12 days) on tightly coupled neighbor clusters
   * (e.g. ai_search_visibility vs aeo_answer_engines).
   */
  static isClusterInCooldown(
    clusterKey: TopicClusterKey,
    history: TopicHistoryRecord[],
    baseDate = new Date(),
    clusterCooldownDays = 21,
    familyCooldownDays = 12,
  ): { inCooldown: boolean; reason?: string; conflictingCluster?: string } {
    if (!clusterKey || !history || history.length === 0) {
      return { inCooldown: false };
    }

    const clusterInfo = TOPIC_CLUSTERS[clusterKey];
    const neighbors = new Set(getNeighborClusters(clusterKey));
    const nowTime = baseDate.getTime();
    const clusterCutoff = nowTime - clusterCooldownDays * 24 * 60 * 60 * 1000;
    const familyCutoff = nowTime - familyCooldownDays * 24 * 60 * 60 * 1000;

    for (const item of history) {
      const itemCluster = item.cluster_key as TopicClusterKey | undefined;
      if (!itemCluster) continue;

      const itemTime = new Date(item.created_at).getTime();
      const isPending = item.status === 'queued' || item.status === 'scheduled';

      // 1. Direct cluster match
      if (itemCluster === clusterKey) {
        if (isPending || itemTime >= clusterCutoff) {
          return {
            inCooldown: true,
            conflictingCluster: itemCluster,
            reason: `Direct cluster "${clusterKey}" was used recently (${clusterCooldownDays}-day cooldown active).`,
          };
        }
      }

      // 2. Neighbor cluster match within the same semantic family
      if (neighbors.has(itemCluster)) {
        if (isPending || itemTime >= familyCutoff) {
          return {
            inCooldown: true,
            conflictingCluster: itemCluster,
            reason: `Neighbor cluster "${itemCluster}" in family "${clusterInfo?.family || 'unknown'}" was used recently (${familyCooldownDays}-day fatigue window).`,
          };
        }
      }
    }

    return { inCooldown: false };
  }

  /**
   * Fetches recent topic history from D1 database.
   */
  async getRecentTopicHistory(days = 21): Promise<TopicHistoryRecord[]> {
    try {
      const res = await this.db
        .prepare(
          `SELECT id, idea_id, post_id, content_pillar, content_angle, title, cluster_key, status, suggested_publish_date, published_at, created_at
           FROM content_topic_history
           WHERE created_at >= datetime('now', '-' || ? || ' days') OR status IN ('queued', 'scheduled')
           ORDER BY created_at DESC`,
        )
        .bind(days)
        .all<TopicHistoryRecord>();
      return res.results || [];
    } catch {
      try {
        const fallbackRes = await this.db
          .prepare(
            `SELECT id, idea_id, post_id, content_pillar, content_angle, title, status, suggested_publish_date, published_at, created_at
             FROM content_topic_history
             WHERE created_at >= datetime('now', '-' || ? || ' days') OR status IN ('queued', 'scheduled')
             ORDER BY created_at DESC`,
          )
          .bind(days)
          .all<TopicHistoryRecord>();
        return fallbackRes.results || [];
      } catch {
        return [];
      }
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
    cluster_key?: string;
    status?: 'queued' | 'scheduled' | 'published' | 'expired';
    suggested_publish_date?: string;
  }): Promise<string> {
    const id = entry.id || crypto.randomUUID();
    const nowIso = new Date().toISOString();
    try {
      await this.db
        .prepare(
          `INSERT INTO content_topic_history (
            id, idea_id, post_id, content_pillar, content_angle, title, cluster_key, status, suggested_publish_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          entry.idea_id || null,
          entry.post_id || null,
          entry.content_pillar,
          entry.content_angle,
          entry.title,
          entry.cluster_key || null,
          entry.status || 'queued',
          entry.suggested_publish_date || null,
          nowIso,
        )
        .run();
    } catch {
      // Fallback for older schemas without cluster_key
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
        // Ignore in tests
      }
    }
    return id;
  }
}
