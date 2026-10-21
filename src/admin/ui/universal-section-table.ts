/**
 * NorthSoft.AI.ContentCreator — Universal Section Table Primitives
 *
 * Implements pure classification logic, sorting, pagination, selection calculations,
 * and the client-side UniversalSectionTable class for intelligent grouping in the admin UI.
 */

export type TopicSectionCategory = 'active' | 'converted' | 'archived';
export type PostSectionCategory = 'draft' | 'scheduled' | 'published';
export type ScheduleSectionCategory = 'upcoming' | 'past';

export interface TopicRecord {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  post_count?: number;
  content_pillar?: string;
  category?: string;
  [key: string]: unknown;
}

export interface PostRecord {
  id?: string;
  title?: string;
  body?: string;
  latest_body?: string;
  status?: string;
  schedule_id?: string;
  scheduled_at?: string;
  scheduledAt?: string;
  published_at?: string;
  publishedAt?: string;
  facebook_post_id?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ScheduleRecord {
  id?: string;
  post_id?: string;
  status?: string;
  post_status?: string;
  scheduled_at?: string;
  scheduledAt?: string;
  [key: string]: unknown;
}

/**
 * Classifies a topic into one of 3 mutually exclusive sections:
 * - active: unworked topic waiting for review or generation (post_count === 0, not rejected)
 * - converted: topic already in pipeline or published (post_count > 0 or status is post_generated, scheduled, published, used)
 * - archived: explicitly rejected topic with no linked posts
 */
export function classifyTopic(topic?: TopicRecord | null): TopicSectionCategory {
  if (!topic) return 'active';
  const hasPost = Number(topic.post_count || 0) > 0;
  const rawStatus = (topic.status || '').toLowerCase().trim();

  if (hasPost || ['published', 'used', 'post_generated', 'scheduled'].includes(rawStatus)) {
    return 'converted';
  }

  if (rawStatus === 'rejected') {
    return 'archived';
  }

  return 'active';
}

/**
 * Checks if a post is considered published (live on Facebook or has live publication record).
 */
export function isPublishedPost(p?: PostRecord | null): boolean {
  if (!p) return false;
  const st = (p.status || '').toLowerCase().trim();
  return st === 'published' || Boolean(p.published_at || p.publishedAt || p.facebook_post_id);
}

/**
 * Checks if a post is considered scheduled (committed to a valid future time slot).
 */
export function isScheduledPost(p?: PostRecord | null): boolean {
  if (!p || isPublishedPost(p)) return false;
  const schedTime = p.scheduled_at || p.scheduledAt;
  if (!schedTime) return false;
  const timestamp = new Date(schedTime).getTime();
  const hasScheduleIndicator = Boolean(
    p.schedule_id || (p.status || '').toLowerCase().trim() === 'scheduled',
  );
  return Boolean(hasScheduleIndicator && !isNaN(timestamp) && timestamp > Date.now());
}

/**
 * Classifies a post into one of 3 mutually exclusive sections:
 * - draft: active draft being drafted, reviewed, edited, or needing image assignment / conflict resolution
 * - scheduled: committed to future automated publication
 * - published: live on Facebook
 */
export function classifyPost(post?: PostRecord | null): PostSectionCategory {
  if (!post) return 'draft';
  if (isPublishedPost(post)) return 'published';
  if (isScheduledPost(post)) return 'scheduled';
  return 'draft';
}

/**
 * Classifies a schedule into one of 2 mutually exclusive sections:
 * - upcoming: future pending publication
 * - past: completed or executed schedule
 */
export function classifySchedule(schedule?: ScheduleRecord | null): ScheduleSectionCategory {
  if (!schedule) return 'upcoming';
  const isCompleted =
    (schedule.status || '').toLowerCase().trim() === 'published' ||
    (schedule.post_status || '').toLowerCase().trim() === 'published';
  return isCompleted ? 'past' : 'upcoming';
}

export interface ColumnSortDefinition<T = unknown> {
  key: string;
  getValue?: (item: T) => unknown;
  isDate?: boolean;
  isNumeric?: boolean;
}

/**
 * Sorts section items before pagination with support for dates, numbers, strings, and missing values.
 */
export function sortSectionItems<T>(
  items: T[],
  columnKey: string,
  direction: 'asc' | 'desc',
  columnDefs?: ColumnSortDefinition<T>[],
): T[] {
  if (!columnKey || !Array.isArray(items) || items.length < 2) {
    return items.slice();
  }

  const colDef = columnDefs?.find((c) => c.key === columnKey);
  const isDateCol =
    colDef?.isDate ||
    /date|time|published|timestamp|created|scheduled/.test(columnKey.toLowerCase());
  const isNumericCol =
    colDef?.isNumeric ||
    /views|reactions|comments|shares|count|items|topics|score|priority/.test(
      columnKey.toLowerCase(),
    );

  const keyed = items.map((item, originalIndex) => {
    let rawVal: unknown = undefined;
    if (colDef?.getValue) {
      rawVal = colDef.getValue(item);
    } else if (item && typeof item === 'object') {
      rawVal = (item as Record<string, unknown>)[columnKey];
    }

    if (rawVal === null || rawVal === undefined) rawVal = '';
    const str = String(rawVal).trim();
    let sortKey: string | number = str.toLowerCase();
    let isEmpty = str === '' || str === '—' || str === '-';

    if (isDateCol && !isEmpty) {
      const parsed = Date.parse(str);
      if (Number.isFinite(parsed)) sortKey = parsed;
      else isEmpty = true;
    } else if (isNumericCol && !isEmpty) {
      const parsed = Number(str.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(parsed)) sortKey = parsed;
    } else if (!isEmpty && /^-?[0-9]+(?:[.,][0-9]+)?$/.test(str)) {
      sortKey = Number(str.replace(',', '.'));
    }

    return { item, sortKey, isEmpty, originalIndex };
  });

  keyed.sort((a, b) => {
    if (a.isEmpty !== b.isEmpty) return a.isEmpty ? 1 : -1;
    let cmp: number;
    if (typeof a.sortKey === 'number' && typeof b.sortKey === 'number') {
      cmp = a.sortKey - b.sortKey;
    } else {
      cmp = String(a.sortKey).localeCompare(String(b.sortKey), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
    if (direction === 'desc') cmp *= -1;
    return cmp || a.originalIndex - b.originalIndex;
  });

  return keyed.map((k) => k.item);
}

/**
 * Slices a pre-sorted dataset into the requested page slice, safely clamping invalid page numbers.
 */
export function sliceSectionPage<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
} {
  const totalItems = items.length;
  const validPageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / validPageSize));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  if (totalItems === 0) {
    return {
      pageItems: [],
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      rangeStart: 0,
      rangeEnd: 0,
    };
  }

  const start = (currentPage - 1) * validPageSize;
  const pageItems = items.slice(start, start + validPageSize);
  const rangeStart = start + 1;
  const rangeEnd = Math.min(start + pageItems.length, totalItems);

  return {
    pageItems,
    currentPage,
    totalPages,
    totalItems,
    rangeStart,
    rangeEnd,
  };
}

/**
 * Calculates whether the section's master checkbox should be checked, unchecked, or indeterminate.
 */
export function calculateIndeterminateState(
  pageItemIds: string[],
  selectedIds: Set<string>,
): { isChecked: boolean; isIndeterminate: boolean; selectedCount: number } {
  if (pageItemIds.length === 0) {
    return { isChecked: false, isIndeterminate: false, selectedCount: 0 };
  }

  const selectedCount = pageItemIds.filter((id) => selectedIds.has(id)).length;

  if (selectedCount === 0) {
    return { isChecked: false, isIndeterminate: false, selectedCount: 0 };
  }

  if (selectedCount === pageItemIds.length) {
    return { isChecked: true, isIndeterminate: false, selectedCount };
  }

  return { isChecked: false, isIndeterminate: true, selectedCount };
}
