import { describe, expect, it } from 'vitest';
import {
  classifyTopic,
  classifyPost,
  classifySchedule,
  sortSectionItems,
  sliceSectionPage,
  calculateIndeterminateState,
  type TopicRecord,
  type PostRecord,
  type ScheduleRecord,
} from '../../src/admin/ui/universal-section-table';

describe('Universal Tables UX — Intelligent Grouping & Interaction Primitives', () => {
  describe('Topic Research Classification Logic', () => {
    it('classifies unworked topics without posts as active work queue', () => {
      const topic1: TopicRecord = {
        id: 't1',
        title: 'New AI Idea',
        status: 'queued',
        post_count: 0,
      };
      const topic2: TopicRecord = {
        id: 't2',
        title: 'Discovered Website Idea',
        status: 'discovered',
        post_count: 0,
      };
      const topic3: TopicRecord = {
        id: 't3',
        title: 'Accepted Marketing Idea',
        status: 'accepted',
        post_count: 0,
      };
      const topic4: TopicRecord = {
        id: 't4',
        title: 'Ready Topic',
        status: 'ready',
        post_count: 0,
      };

      expect(classifyTopic(topic1)).toBe('active');
      expect(classifyTopic(topic2)).toBe('active');
      expect(classifyTopic(topic3)).toBe('active');
      expect(classifyTopic(topic4)).toBe('active');
    });

    it('classifies topics with generated posts as converted', () => {
      const topicWithPost: TopicRecord = {
        id: 't5',
        title: 'Has 1 Post',
        status: 'queued',
        post_count: 1,
      };
      const topicPostGen: TopicRecord = {
        id: 't6',
        title: 'Generated',
        status: 'post_generated',
        post_count: 1,
      };
      const topicSched: TopicRecord = {
        id: 't7',
        title: 'Scheduled Topic',
        status: 'scheduled',
        post_count: 1,
      };
      const topicPub: TopicRecord = {
        id: 't8',
        title: 'Published Topic',
        status: 'published',
        post_count: 1,
      };
      const topicUsed: TopicRecord = {
        id: 't9',
        title: 'Used Topic',
        status: 'used',
        post_count: 2,
      };

      expect(classifyTopic(topicWithPost)).toBe('converted');
      expect(classifyTopic(topicPostGen)).toBe('converted');
      expect(classifyTopic(topicSched)).toBe('converted');
      expect(classifyTopic(topicPub)).toBe('converted');
      expect(classifyTopic(topicUsed)).toBe('converted');
    });

    it('classifies rejected topics without posts as archived/rejected', () => {
      const rejectedTopic: TopicRecord = {
        id: 't10',
        title: 'Irrelevant Idea',
        status: 'rejected',
        post_count: 0,
      };
      expect(classifyTopic(rejectedTopic)).toBe('archived');
    });

    it('classifies rejected topics that generated posts as converted to preserve linked post audit trail', () => {
      const rejectedWithPost: TopicRecord = {
        id: 't11',
        title: 'Was drafted then rejected',
        status: 'rejected',
        post_count: 1,
      };
      expect(classifyTopic(rejectedWithPost)).toBe('converted');
    });

    it('handles null, undefined, or missing statuses safely', () => {
      expect(classifyTopic(null)).toBe('active');
      expect(classifyTopic({ id: 't12', title: 'No status' })).toBe('active');
    });
  });

  describe('Content Drafts Classification Logic', () => {
    it('classifies drafts and review items as draft queue', () => {
      const draftPost: PostRecord = { id: 'p1', title: 'Draft Post', status: 'draft' };
      const approvedPost: PostRecord = { id: 'p2', title: 'Approved Post', status: 'approved' };
      const readyPost: PostRecord = { id: 'p3', title: 'Ready Post', status: 'ready' };
      const conflictPost: PostRecord = {
        id: 'p4',
        title: 'Conflict Post',
        status: 'draft',
        sync_status: 'CONFLICT',
      };

      expect(classifyPost(draftPost)).toBe('draft');
      expect(classifyPost(approvedPost)).toBe('draft');
      expect(classifyPost(readyPost)).toBe('draft');
      expect(classifyPost(conflictPost)).toBe('draft');
    });

    it('classifies posts with valid future schedules as scheduled queue', () => {
      const futureTime = new Date(Date.now() + 86400000).toISOString();
      const scheduledPost: PostRecord = {
        id: 'p5',
        title: 'Tomorrow Post',
        status: 'scheduled',
        schedule_id: 'sch-1',
        scheduled_at: futureTime,
      };

      expect(classifyPost(scheduledPost)).toBe('scheduled');
    });

    it('classifies posts live on Facebook as published history', () => {
      const pub1: PostRecord = { id: 'p6', title: 'Live 1', status: 'published' };
      const pub2: PostRecord = {
        id: 'p7',
        title: 'Live 2',
        status: 'draft',
        facebook_post_id: '123_456',
      };
      const pub3: PostRecord = {
        id: 'p8',
        title: 'Live 3',
        status: 'approved',
        published_at: '2026-10-15T10:00:00Z',
      };

      expect(classifyPost(pub1)).toBe('published');
      expect(classifyPost(pub2)).toBe('published');
      expect(classifyPost(pub3)).toBe('published');
    });

    it('handles expired past schedules by safely treating them as drafts awaiting execution or sync', () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const expiredSched: PostRecord = {
        id: 'p9',
        title: 'Missed Window Post',
        status: 'scheduled',
        schedule_id: 'sch-old',
        scheduled_at: pastTime,
      };

      // Past scheduled posts that are not marked published should stay in draft/review so they do not hide from editorial attention
      expect(classifyPost(expiredSched)).toBe('draft');
    });
  });

  describe('Scheduled Queue Classification Logic', () => {
    it('classifies pending schedules as upcoming', () => {
      const s1: ScheduleRecord = { id: 's1', status: 'scheduled', post_status: 'scheduled' };
      const s2: ScheduleRecord = { id: 's2', status: 'pending', post_status: 'draft' };

      expect(classifySchedule(s1)).toBe('upcoming');
      expect(classifySchedule(s2)).toBe('upcoming');
    });

    it('classifies completed or published schedules as past', () => {
      const s3: ScheduleRecord = { id: 's3', status: 'published', post_status: 'published' };
      const s4: ScheduleRecord = { id: 's4', status: 'executed', post_status: 'published' };

      expect(classifySchedule(s3)).toBe('past');
      expect(classifySchedule(s4)).toBe('past');
    });
  });

  describe('Independent Section Sorting', () => {
    interface TestItem {
      id: string;
      title: string;
      score: number;
      createdAt: string;
    }

    const items: TestItem[] = [
      { id: '1', title: 'Zebra topic', score: 10, createdAt: '2026-10-20T12:00:00Z' },
      { id: '2', title: 'Alpha topic', score: 95, createdAt: '2026-10-18T08:00:00Z' },
      { id: '3', title: 'Middle topic', score: 50, createdAt: '2026-10-19T10:00:00Z' },
      { id: '4', title: 'No score', score: null as unknown as number, createdAt: '' },
    ];

    it('sorts strings ascending and descending with case-insensitive natural comparison', () => {
      const asc = sortSectionItems(items, 'title', 'asc');
      expect(asc[0]!.title).toBe('Alpha topic');
      expect(asc[1]!.title).toBe('Middle topic');
      expect(asc[2]!.title).toBe('No score');
      expect(asc[3]!.title).toBe('Zebra topic');

      const desc = sortSectionItems(items, 'title', 'desc');
      expect(desc[0]!.title).toBe('Zebra topic');
      expect(desc[1]!.title).toBe('No score');
      expect(desc[2]!.title).toBe('Middle topic');
      expect(desc[3]!.title).toBe('Alpha topic');
    });

    it('sorts numeric values numerically, placing empty/missing values last', () => {
      const asc = sortSectionItems(items, 'score', 'asc');
      expect(asc[0]!.score).toBe(10);
      expect(asc[1]!.score).toBe(50);
      expect(asc[2]!.score).toBe(95);
      expect(asc[3]!.id).toBe('4'); // null/empty at end

      const desc = sortSectionItems(items, 'score', 'desc');
      expect(desc[0]!.score).toBe(95);
      expect(desc[1]!.score).toBe(50);
      expect(desc[2]!.score).toBe(10);
      expect(desc[3]!.id).toBe('4');
    });

    it('sorts date strings chronologically', () => {
      const asc = sortSectionItems(items, 'createdAt', 'asc');
      expect(asc[0]!.id).toBe('2'); // Oct 18
      expect(asc[1]!.id).toBe('3'); // Oct 19
      expect(asc[2]!.id).toBe('1'); // Oct 20
      expect(asc[3]!.id).toBe('4'); // empty date at end

      const desc = sortSectionItems(items, 'createdAt', 'desc');
      expect(desc[0]!.id).toBe('1'); // Oct 20
      expect(desc[1]!.id).toBe('3'); // Oct 19
      expect(desc[2]!.id).toBe('2'); // Oct 18
      expect(desc[3]!.id).toBe('4');
    });
  });

  describe('Independent Section Pagination & Clamping', () => {
    const twentyItems = Array.from({ length: 23 }, (_, i) => ({
      id: `item-${i + 1}`,
      name: `Item ${i + 1}`,
    }));

    it('slices page 1 with default page size 10', () => {
      const res = sliceSectionPage(twentyItems, 1, 10);
      expect(res.currentPage).toBe(1);
      expect(res.totalPages).toBe(3);
      expect(res.totalItems).toBe(23);
      expect(res.pageItems).toHaveLength(10);
      expect(res.pageItems[0]!.id).toBe('item-1');
      expect(res.pageItems[9]!.id).toBe('item-10');
      expect(res.rangeStart).toBe(1);
      expect(res.rangeEnd).toBe(10);
    });

    it('slices page 3 with remaining 3 items', () => {
      const res = sliceSectionPage(twentyItems, 3, 10);
      expect(res.currentPage).toBe(3);
      expect(res.pageItems).toHaveLength(3);
      expect(res.pageItems[0]!.id).toBe('item-21');
      expect(res.pageItems[2]!.id).toBe('item-23');
      expect(res.rangeStart).toBe(21);
      expect(res.rangeEnd).toBe(23);
    });

    it('safely clamps invalid page numbers exceeding totalPages', () => {
      const res = sliceSectionPage(twentyItems, 99, 10);
      expect(res.currentPage).toBe(3);
      expect(res.pageItems).toHaveLength(3);
    });

    it('handles empty dataset safely', () => {
      const res = sliceSectionPage([], 1, 10);
      expect(res.currentPage).toBe(1);
      expect(res.totalPages).toBe(1);
      expect(res.totalItems).toBe(0);
      expect(res.pageItems).toHaveLength(0);
      expect(res.rangeStart).toBe(0);
      expect(res.rangeEnd).toBe(0);
    });

    it('supports alternative page sizes: 5, 25, 50', () => {
      const res5 = sliceSectionPage(twentyItems, 1, 5);
      expect(res5.totalPages).toBe(5);
      expect(res5.pageItems).toHaveLength(5);

      const res25 = sliceSectionPage(twentyItems, 1, 25);
      expect(res25.totalPages).toBe(1);
      expect(res25.pageItems).toHaveLength(23);
    });
  });

  describe('Isolated Selection & Indeterminate State', () => {
    it('returns isChecked=false and isIndeterminate=false when no items selected', () => {
      const pageIds = ['a', 'b', 'c'];
      const selected = new Set<string>();

      const state = calculateIndeterminateState(pageIds, selected);
      expect(state.isChecked).toBe(false);
      expect(state.isIndeterminate).toBe(false);
      expect(state.selectedCount).toBe(0);
    });

    it('returns isChecked=true and isIndeterminate=false when all page items selected', () => {
      const pageIds = ['a', 'b', 'c'];
      const selected = new Set(['a', 'b', 'c', 'other-section-id']);

      const state = calculateIndeterminateState(pageIds, selected);
      expect(state.isChecked).toBe(true);
      expect(state.isIndeterminate).toBe(false);
      expect(state.selectedCount).toBe(3);
    });

    it('returns isChecked=false and isIndeterminate=true when partially selected on page', () => {
      const pageIds = ['a', 'b', 'c'];
      const selected = new Set(['b']);

      const state = calculateIndeterminateState(pageIds, selected);
      expect(state.isChecked).toBe(false);
      expect(state.isIndeterminate).toBe(true);
      expect(state.selectedCount).toBe(1);
    });

    it('selection in one section does not count towards another section page items', () => {
      const sectionAPageIds = ['a1', 'a2'];
      const sectionBPageIds = ['b1', 'b2'];
      const sectionASelected = new Set(['a1', 'a2']);

      const stateA = calculateIndeterminateState(sectionAPageIds, sectionASelected);
      expect(stateA.isChecked).toBe(true);

      const stateB = calculateIndeterminateState(sectionBPageIds, sectionASelected);
      expect(stateB.isChecked).toBe(false);
      expect(stateB.isIndeterminate).toBe(false);
      expect(stateB.selectedCount).toBe(0);
    });
  });

  describe('Multi-Section Independence & Dynamic Clamping', () => {
    it('maintains independent sort orders across different sections simultaneously', () => {
      const activeTopics = [
        { id: 't1', title: 'Beta Idea', created_at: '2026-10-15T00:00:00Z' },
        { id: 't2', title: 'Alpha Idea', created_at: '2026-10-20T00:00:00Z' },
      ];
      const convertedTopics = [
        { id: 't3', title: 'Delta Idea', created_at: '2026-10-18T00:00:00Z' },
        { id: 't4', title: 'Gamma Idea', created_at: '2026-10-12T00:00:00Z' },
      ];

      // Section A sorted by title ASC
      const sortedSectionA = sortSectionItems(activeTopics, 'title', 'asc');
      // Section B sorted by created_at DESC
      const sortedSectionB = sortSectionItems(convertedTopics, 'created_at', 'desc');

      expect(sortedSectionA[0]!.title).toBe('Alpha Idea');
      expect(sortedSectionA[1]!.title).toBe('Beta Idea');

      expect(sortedSectionB[0]!.title).toBe('Delta Idea'); // Oct 18 is newer than Oct 12
      expect(sortedSectionB[1]!.title).toBe('Gamma Idea');
    });

    it('clamps current page when items are removed from a section', () => {
      // User was on page 3 of 3 (25 items, pageSize 10)
      const pageBefore = 3;
      // 18 items removed, now only 7 items left
      const reducedItems = Array.from({ length: 7 }, (_, i) => ({ id: `it-${i}` }));
      const pageResult = sliceSectionPage(reducedItems, pageBefore, 10);

      expect(pageResult.currentPage).toBe(1);
      expect(pageResult.totalPages).toBe(1);
      expect(pageResult.pageItems).toHaveLength(7);
    });
  });
});
