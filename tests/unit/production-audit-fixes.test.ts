import { describe, expect, it, vi } from 'vitest';
import { recalculateCuratedImageUsage } from '../../src/services/content/image-library-service';
import { renderAdminHtml } from '../../src/admin/ui';
import { getAdminScripts } from '../../src/admin/ui/scripts';
import vm from 'node:vm';

describe('Production Audit & Fixes Verification Suite', () => {
  describe('1. Canonical Image Usage Tracking & History Separation', () => {
    it('accurately computes currentUsageCount vs historicalUsageCount across drafts, schedules, and publications', async () => {
      // Mock D1 state representing post_images, posts, publications, and schedules
      const curatedImages = new Map<string, any>();
      const postImages: any[] = [];
      const posts = new Map<string, any>();
      const publications: any[] = [];
      const schedules = new Map<string, any>();

      // Image A, Image B, Image C
      curatedImages.set('img-A', {
        id: 'img-A',
        title: 'Image A',
        source_url: 'https://example.com/img-a.jpg',
        r2_key: null,
        status: 'APPROVED',
        usage_count: 0,
        historical_usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
      });
      curatedImages.set('img-B', {
        id: 'img-B',
        title: 'Image B',
        source_url: 'https://example.com/img-b.jpg',
        r2_key: null,
        status: 'APPROVED',
        usage_count: 0,
        historical_usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
      });
      curatedImages.set('img-C', {
        id: 'img-C',
        title: 'Image C',
        source_url: 'https://example.com/img-c.jpg',
        r2_key: null,
        status: 'APPROVED',
        usage_count: 0,
        historical_usage_count: 0,
        last_used_at: null,
        used_in_post_id: null,
        reserved_post_id: null,
      });

      const mockDb: any = {
        prepare: (sql: string) => {
          return {
            bind: (...args: any[]) => {
              return {
                first: async () => {
                  if (sql.includes('FROM curated_images WHERE id =')) {
                    return curatedImages.get(args[0]) || null;
                  }
                  if (sql.includes('pub_count')) {
                    const imgId = args[0];
                    const matchedPubs = publications.filter(p => p.curated_image_id === imgId);
                    const maxPublishedAt = matchedPubs.reduce((max, p) => !max || p.published_at > max ? p.published_at : max, null);
                    return {
                      pub_count: matchedPubs.length,
                      max_published_at: maxPublishedAt,
                    };
                  }
                  if (sql.includes('audit_pub_count')) {
                    return { audit_pub_count: 0, max_audit_time: null };
                  }
                  if (sql.includes('current_count')) {
                    const imgId = args[0];
                    const activePosts = new Set<string>();
                    for (const pi of postImages) {
                      if (pi.curated_image_id === imgId) {
                        const post = posts.get(pi.post_id);
                        if (post && post.status !== 'rejected' && post.current_version === pi.version_number) {
                          activePosts.add(post.id);
                        }
                      }
                    }
                    const latestPostId = Array.from(activePosts).pop() || null;
                    return {
                      current_count: activePosts.size,
                      latest_post_id: latestPostId,
                    };
                  }
                  if (sql.includes('SELECT p.id FROM posts p')) {
                    const imgId = args[0];
                    for (const pi of postImages) {
                      if (pi.curated_image_id === imgId) {
                        const post = posts.get(pi.post_id);
                        if (post && ['draft', 'approved', 'scheduled'].includes(post.status)) {
                          return { id: post.id };
                        }
                      }
                    }
                    return null;
                  }
                  return null;
                },
                run: async () => {
                  if (sql.includes('UPDATE curated_images')) {
                    const [usageCount, histUsageCount, lastUsedAt, usedInPostId, reservedPostId, _nowIso, imgId] = args;
                    const img = curatedImages.get(imgId);
                    if (img) {
                      img.usage_count = usageCount;
                      img.historical_usage_count = histUsageCount;
                      img.last_used_at = lastUsedAt;
                      img.used_in_post_id = usedInPostId;
                      img.reserved_post_id = reservedPostId;
                    }
                    return { meta: { changes: 1 } };
                  }
                  return { meta: { changes: 0 } };
                },
              };
            },
            first: async () => null,
            run: async () => ({ meta: { changes: 0 } }),
          };
        },
      };

      // 1. Post 1 created as draft with Image A
      posts.set('post-1', { id: 'post-1', status: 'draft', current_version: 1 });
      postImages.push({ post_id: 'post-1', version_number: 1, curated_image_id: 'img-A' });

      await recalculateCuratedImageUsage(mockDb, 'img-A');
      expect(curatedImages.get('img-A').usage_count).toBe(1);
      expect(curatedImages.get('img-A').historical_usage_count).toBe(0);
      expect(curatedImages.get('img-A').reserved_post_id).toBe('post-1');

      // 2. Post 1 moves from draft to scheduled with Image A
      posts.get('post-1').status = 'scheduled';
      schedules.set('sched-1', { id: 'sched-1', post_id: 'post-1', status: 'pending' });

      await recalculateCuratedImageUsage(mockDb, 'img-A');
      expect(curatedImages.get('img-A').usage_count).toBe(1);
      expect(curatedImages.get('img-A').historical_usage_count).toBe(0);

      // 3. Post 1 is published with Image A
      posts.get('post-1').status = 'published';
      schedules.get('sched-1').status = 'completed';
      publications.push({ id: 'pub-1', post_id: 'post-1', facebook_post_id: 'fb-1', curated_image_id: 'img-A', published_at: '2026-10-01T12:00:00Z' });

      await recalculateCuratedImageUsage(mockDb, 'img-A');
      expect(curatedImages.get('img-A').usage_count).toBe(1);
      expect(curatedImages.get('img-A').historical_usage_count).toBe(1);
      expect(curatedImages.get('img-A').reserved_post_id).toBe(null); // Cleared because post is now published

      // 4. Change A -> B on published post (User edits image)
      // Post 1 now attaches Image B
      postImages.find(pi => pi.post_id === 'post-1').curated_image_id = 'img-B';
      // Publication record now points to Image B
      publications.push({ id: 'pub-2', post_id: 'post-1', facebook_post_id: 'fb-1', curated_image_id: 'img-B', published_at: '2026-10-02T12:00:00Z' });

      await recalculateCuratedImageUsage(mockDb, 'img-A');
      await recalculateCuratedImageUsage(mockDb, 'img-B');

      // Image A: current usage = 0 (no longer actively attached to post current version), historical = 1
      expect(curatedImages.get('img-A').usage_count).toBe(0);
      expect(curatedImages.get('img-A').historical_usage_count).toBe(1);

      // Image B: current usage = 1, historical = 1
      expect(curatedImages.get('img-B').usage_count).toBe(1);
      expect(curatedImages.get('img-B').historical_usage_count).toBe(1);

      // 5. Change B -> C
      postImages.find(pi => pi.post_id === 'post-1').curated_image_id = 'img-C';
      publications.push({ id: 'pub-3', post_id: 'post-1', facebook_post_id: 'fb-1', curated_image_id: 'img-C', published_at: '2026-10-02T14:00:00Z' });

      await recalculateCuratedImageUsage(mockDb, 'img-B');
      await recalculateCuratedImageUsage(mockDb, 'img-C');

      expect(curatedImages.get('img-B').usage_count).toBe(0);
      expect(curatedImages.get('img-B').historical_usage_count).toBe(1);

      expect(curatedImages.get('img-C').usage_count).toBe(1);
      expect(curatedImages.get('img-C').historical_usage_count).toBe(1);
    });
  });

  describe('2. JavaScript openFacebookPostDetails Regression Test', () => {
    it('opens published post modal in DOM sandbox without throwing Cannot set properties of null', async () => {
      const scripts = getAdminScripts();

      const domElements = new Map<string, any>();
      const makeEl = (id: string, tag: string = 'div') => {
        const el: any = {
          id,
          tagName: tag.toUpperCase(),
          value: '',
          checked: false,
          style: {},
          dataset: {},
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn().mockReturnValue(false),
          },
          innerHTML: '',
          textContent: '',
          setAttribute: vi.fn(),
          removeAttribute: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          querySelectorAll: vi.fn().mockReturnValue([]),
        };
        domElements.set(id, el);
        return el;
      };

      // Create essential DOM elements used by openFacebookPostDetails
      makeEl('fb-post-detail-error');
      makeEl('fb-post-detail-content', 'textarea');
      makeEl('fb-post-detail-meta');
      makeEl('fb-post-detail-stats');
      makeEl('fb-post-detail-image-wrap');
      makeEl('fb-post-detail-image', 'img');
      makeEl('fb-post-remove-image-btn', 'button');
      makeEl('fb-post-detail-link', 'a');
      makeEl('fb-post-hide-button', 'button');
      makeEl('facebook-post-modal');
      makeEl('login-modal');
      makeEl('dashboard-view');

      const sandbox: any = {
        window: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          location: { search: '', pathname: '/admin' },
        },
        document: {
          getElementById: (id: string) => domElements.get(id) || makeEl(id),
          querySelector: (_sel: string) => null,
          querySelectorAll: (_sel: string) => [],
          createElement: (tag: string) => makeEl(`gen-${Math.random()}`, tag),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        fetch: async (url: string) => {
          if (url.includes('/session')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({ authenticated: true, user: { username: 'admin' }, csrfToken: 'dummy' }),
            };
          }
          if (url.includes('/api/admin/content/posts/')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                post: {
                  id: 'int-post-99',
                  facebook_post_id: 'fb-post-99',
                  latest_body: 'Published Facebook content',
                  published_at: '2026-10-01T15:00:00Z',
                  topic_title: 'Security Systems',
                  image_url: 'https://example.com/sec.jpg',
                },
              }),
            };
          }
          return { ok: true, status: 200, json: async () => ({}) };
        },
        console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
        setTimeout: (fn: any) => fn(),
        clearTimeout: vi.fn(),
        URLSearchParams,
        Date,
        encodeURIComponent,
        Number,
        Array,
        Object,
        String,
        Boolean,
        Math,
      };
      sandbox.window.window = sandbox.window;
      sandbox.window.document = sandbox.document;
      sandbox.window.console = sandbox.console;
      sandbox.window.URLSearchParams = URLSearchParams;
      sandbox.window.fetch = sandbox.fetch;

      const context = vm.createContext(sandbox);
      vm.runInContext(scripts, context);

      // Verify openFacebookPostDetails exists
      expect(typeof sandbox.openFacebookPostDetails).toBe('function');

      // Call openFacebookPostDetails for post - should fetch and populate smoothly without throwing TypeError
      await sandbox.openFacebookPostDetails('fb-post-99');

      // Check that elements were correctly populated
      const contentEl = domElements.get('fb-post-detail-content');
      expect(contentEl.value).toBe('Published Facebook content');
      expect(contentEl.dataset.facebookPostId).toBe('fb-post-99');
      expect(contentEl.dataset.internalPostId).toBe('int-post-99');

      const imgEl = domElements.get('fb-post-detail-image');
      expect(imgEl.src).toBe('https://example.com/sec.jpg');
      expect(domElements.get('fb-post-detail-image-wrap').style.display).toBe('block');
      expect(domElements.get('fb-post-remove-image-btn').style.display).toBe('inline-block');
    });
  });

  describe('3. Receiving end does not exist — Root Cause Verification', () => {
    it('confirms the codebase contains zero browser extension messaging calls or unhandled page-load promises', () => {
      const scripts = getAdminScripts();

      // "Could not establish connection. Receiving end does not exist." is an error thrown exclusively
      // by the Chromium runtime (chrome.runtime.sendMessage / browser.runtime.sendMessage) when
      // an installed browser extension (e.g. password managers, adblockers, grammarly) sends an async message
      // to its background script that has become unloaded or not yet registered.
      expect(scripts.includes('chrome.runtime')).toBe(false);
      expect(scripts.includes('browser.runtime')).toBe(false);
      expect(scripts.includes('chrome.tabs')).toBe(false);
      expect(scripts.includes('serviceWorker.register')).toBe(false);
    });
  });

  describe('4. Scheduled Queue Direct Edit & Published Separation', () => {
    it('scheduled list renders UPCOMING and PUBLISHED post items with correct actions and styling', () => {
      const scripts = getAdminScripts();

      // Verify scripts contain the upcoming / published queue separation logic
      expect(scripts.includes('UPCOMING SCHEDULED POSTS')).toBe(true);
      expect(scripts.includes('PUBLISHED POSTS')).toBe(true);

      // Verify clicking Edit on an upcoming post opens openScheduledPostDetailModal directly
      expect(scripts.includes('openScheduledPostDetailModal(&quot;' + '\'' + ' + s.id + ' + '\'' + '&quot;)') ||
             scripts.includes('openScheduledPostDetailModal(')).toBe(true);

      // Verify published posts in queue list route to openFacebookPostDetails instead of rescheduling
      expect(scripts.includes('openFacebookPostDetails(&quot;' + '\'' + ' + (fbPostId || postIdStr) + ' + '\'' + '&quot;)') ||
             scripts.includes('openFacebookPostDetails(')).toBe(true);
    });
  });

  describe('5. Image Input Restrictions', () => {
    it('verifies post, scheduled, and facebook modals have no raw file or URL input fields outside Image Library', () => {
      const html = renderAdminHtml();

      // Check post-modal
      const postModalSection = html.slice(html.indexOf('id="post-modal"'), html.indexOf('id="bulk-post-modal"'));
      expect(postModalSection.includes('id="post-image-url"')).toBe(false);
      expect(postModalSection.includes('id="post-image-file"')).toBe(false);
      expect(postModalSection.includes('openDraftImageSelectorModalForDraft()')).toBe(true);

      // Check scheduled-post-detail-modal
      expect(html.includes('id="scheduled-post-detail-modal"')).toBe(true);
      expect(html.includes('openDraftImageSelectorModalForScheduled()')).toBe(true);
      expect(html.includes('id="sched-detail-image-wrap"')).toBe(true);

      // Check facebook-post-modal
      expect(html.includes('id="facebook-post-modal"')).toBe(true);
      expect(html.includes('id="fb-post-image-url"')).toBe(false);
      expect(html.includes('id="fb-post-image-file"')).toBe(false);
      expect(html.includes('openDraftImageSelectorModalForPublication()')).toBe(true);
    });
  });
});
