/**
 * Content Pipeline Types
 *
 * Domain types representing the content lifecycle from idea to publication.
 * These map to the D1 database schema.
 */

// ============================================================
// Content Ideas
// ============================================================

export type IdeaSourceType = 'manual' | 'research' | 'ai';
export type IdeaStatus = 'new' | 'accepted' | 'rejected' | 'used';

export interface ContentIdea {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  sourceType: IdeaSourceType;
  priority: number;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Posts
// ============================================================

export type PostStatus =
  'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'blocked' | 'rejected';

export interface Post {
  id: string;
  ideaId: string | null;
  title: string;
  status: PostStatus;
  currentVersion: number;
  regenerationCount: number;
  qualityScore: number | null;
  qualityDecision: string | null;
  createdAt: string;
  updatedAt: string;
  blockedAt: string | null;
  blockedReason: string | null;
}

// ============================================================
// Post Versions
// ============================================================

export type ContentType = 'text' | 'link' | 'photo';

export interface PostVersion {
  id: string;
  postId: string;
  versionNumber: number;
  content: string;
  contentType: ContentType;
  metadata: Record<string, unknown> | null;
  aiModel: string | null;
  aiProvider: string | null;
  createdAt: string;
}

// ============================================================
// Sources
// ============================================================

export type SourceType = 'website' | 'rss' | 'api' | 'manual';
export type SourceRelevance = 'primary' | 'supporting' | 'background';

export interface Source {
  id: string;
  url: string | null;
  title: string;
  sourceType: SourceType;
  contentSummary: string | null;
  reliabilityScore: number | null;
  lastAccessedAt: string | null;
  createdAt: string;
}

// ============================================================
// Schedules
// ============================================================

export type ScheduleStatus = 'pending' | 'published' | 'cancelled' | 'failed';

export interface Schedule {
  id: string;
  postId: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Publications
// ============================================================

export type PublicationStatus = 'attempted' | 'success' | 'failed';

export interface Publication {
  id: string;
  postId: string;
  scheduleId: string | null;
  facebookPostId: string | null;
  status: PublicationStatus;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// ============================================================
// AI Runs
// ============================================================

export type AIRunStatus = 'completed' | 'failed' | 'timeout';

export interface AIRun {
  id: string;
  role: string;
  model: string;
  provider: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  entityType: string | null;
  entityId: string | null;
  status: AIRunStatus;
  errorMessage: string | null;
  createdAt: string;
}
