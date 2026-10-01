import { describe, expect, it } from 'vitest';
import { ImageLibraryService } from '../../src/services/content/image-library-service';

function createMockDb() {
  const curatedImages = new Map<string, any>();
  const posts = new Map<string, any>();
  const postImages = new Map<string, any>();

  const db: any = {
    _curatedImages: curatedImages,
    _posts: posts,
    _postImages: postImages,

    prepare: (sql: string) => {
      return {
        bind: (...args: any[]) => {
          return {
            first: async () => {
              if (sql.includes('SELECT * FROM curated_images WHERE id =')) {
                return curatedImages.get(args[0]) || null;
              }
              if (sql.includes('SELECT pi.curated_image_id, ci.status')) {
                const postId = args[0];
                const versionNum = args[1];
                for (const pi of postImages.values()) {
                  if (pi.post_id === postId && pi.version_number === versionNum) {
                    const ci = pi.curated_image_id ? curatedImages.get(pi.curated_image_id) : null;
                    return {
                      curated_image_id: pi.curated_image_id || null,
                      status: ci ? ci.status : null,
                    };
                  }
                }
                return null;
              }
              return null;
            },
            all: async () => {
              if (sql.includes('SELECT p.id, p.idea_id, p.title, p.status')) {
                const requestedId = args[0];
                const results: any[] = [];

                for (const p of posts.values()) {
                  if (requestedId && p.id !== requestedId) continue;

                  // Evaluate JOIN condition
                  let matchedPi: any = null;
                  for (const pi of postImages.values()) {
                    if (pi.post_id === p.id && pi.version_number === p.current_version) {
                      if (p.status === 'published') {
                        matchedPi = pi;
                        break;
                      }
                      // For unpublished posts
                      const ci = pi.curated_image_id ? curatedImages.get(pi.curated_image_id) : null;
                      if (pi.curated_image_id && (!ci || ci.status !== 'APPROVED')) {
                        continue; // Invalid
                      }
                      if (ci && (ci.status === 'DELETED' || ci.status === 'REJECTED')) {
                        continue; // Invalid
                      }
                      matchedPi = pi;
                      break;
                    }
                  }

                  results.push({
                    ...p,
                    image_url: matchedPi ? matchedPi.url : null,
                    curated_image_id: matchedPi ? matchedPi.curated_image_id : null,
                    selection_source: matchedPi ? matchedPi.selection_source : null,
                  });
                }
                return { results };
              }
              return { results: [] };
            },
            run: async () => {
              if (sql.includes('UPDATE curated_images SET')) {
                if (sql.includes('status = ?')) {
                  const status = args[1]; // first bind in updateMetadata is updated_at, second is status if present
                  const id = args[args.length - 1];
                  const img = curatedImages.get(id);
                  if (img) {
                    img.status = status;
                    return { meta: { changes: 1 } };
                  }
                }
                if (sql.includes('reserved_post_id = NULL WHERE id =')) {
                  const id = args[0];
                  const img = curatedImages.get(id);
                  if (img) img.reserved_post_id = null;
                  return { meta: { changes: 1 } };
                }
              }
              if (sql.includes('DELETE FROM post_images')) {
                if (sql.includes('WHERE (curated_image_id = ?')) {
                  const targetId = args[0];
                  let changes = 0;
                  for (const [key, pi] of Array.from(postImages.entries())) {
                    if (pi.curated_image_id === targetId) {
                      const p = posts.get(pi.post_id);
                      if (p && p.status !== 'published') {
                        postImages.delete(key);
                        changes++;
                      }
                    }
                  }
                  return { meta: { changes } };
                }
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
    batch: async (statements: any[]) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
  };

  return db;
}

describe('Image Library ↔ Content Drafts State Consistency', () => {
  it('Scenario A: APPROVED image assigned to draft returns image_url', async () => {
    const db = createMockDb();

    db._curatedImages.set('img-1', { id: 'img-1', title: 'Asset 1', status: 'APPROVED' });
    db._posts.set('post-1', { id: 'post-1', title: 'Post 1', status: 'draft', current_version: 1 });
    db._postImages.set('pi-1', {
      id: 'pi-1',
      post_id: 'post-1',
      version_number: 1,
      url: 'https://example.com/img1.jpg',
      curated_image_id: 'img-1',
      selection_source: 'AUTO',
    });

    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBe('https://example.com/img1.jpg');
  });

  it('Scenario B: Deleting an APPROVED image converts draft to Image Required (image_url = null) and clears draft link', async () => {
    const db = createMockDb();
    const service = new ImageLibraryService(db);

    db._curatedImages.set('img-1', { id: 'img-1', title: 'Asset 1', status: 'APPROVED', reserved_post_id: 'post-1' });
    db._posts.set('post-1', { id: 'post-1', title: 'Post 1', status: 'draft', current_version: 1 });
    db._postImages.set('pi-1', {
      id: 'pi-1',
      post_id: 'post-1',
      version_number: 1,
      url: 'https://example.com/img1.jpg',
      curated_image_id: 'img-1',
      selection_source: 'AUTO',
    });

    // Admin deletes the image
    const updated = await service.updateMetadata('img-1', { status: 'DELETED' });
    expect(updated).toBe(true);

    // Verify draft query returns null for image_url
    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBeNull();
    // Verify draft post_images binding was deleted
    expect(db._postImages.has('pi-1')).toBe(false);
  });

  it('Scenario C: Rejecting an APPROVED image converts draft to Image Required', async () => {
    const db = createMockDb();
    const service = new ImageLibraryService(db);

    db._curatedImages.set('img-2', { id: 'img-2', title: 'Asset 2', status: 'APPROVED' });
    db._posts.set('post-2', { id: 'post-2', title: 'Post 2', status: 'draft', current_version: 1 });
    db._postImages.set('pi-2', {
      id: 'pi-2',
      post_id: 'post-2',
      version_number: 1,
      url: 'https://example.com/img2.jpg',
      curated_image_id: 'img-2',
      selection_source: 'AUTO',
    });

    await service.updateMetadata('img-2', { status: 'REJECTED' });

    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBeNull();
  });

  it('Scenario D: post_images linking to non-existent curated_image_id returns null image_url', async () => {
    const db = createMockDb();

    db._posts.set('post-3', { id: 'post-3', title: 'Post 3', status: 'draft', current_version: 1 });
    db._postImages.set('pi-3', {
      id: 'pi-3',
      post_id: 'post-3',
      version_number: 1,
      url: 'https://example.com/missing.jpg',
      curated_image_id: 'img-non-existent',
      selection_source: 'AUTO',
    });

    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBeNull();
  });

  it('Scenario E: MANUAL selection is invalidated when image is deleted', async () => {
    const db = createMockDb();
    const service = new ImageLibraryService(db);

    db._curatedImages.set('img-manual', { id: 'img-manual', title: 'Manual Asset', status: 'APPROVED' });
    db._posts.set('post-4', { id: 'post-4', title: 'Post 4', status: 'draft', current_version: 1 });
    db._postImages.set('pi-4', {
      id: 'pi-4',
      post_id: 'post-4',
      version_number: 1,
      url: 'https://example.com/manual.jpg',
      curated_image_id: 'img-manual',
      selection_source: 'MANUAL',
    });

    await service.updateMetadata('img-manual', { status: 'DELETED' });

    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBeNull();
  });

  it('Scenario F: Replacement - Deleting image A then assigning image B persists image B', async () => {
    const db = createMockDb();
    const service = new ImageLibraryService(db);

    db._curatedImages.set('img-A', { id: 'img-A', title: 'Asset A', status: 'APPROVED' });
    db._curatedImages.set('img-B', { id: 'img-B', title: 'Asset B', status: 'APPROVED' });
    db._posts.set('post-5', { id: 'post-5', title: 'Post 5', status: 'draft', current_version: 1 });
    db._postImages.set('pi-5', {
      id: 'pi-5',
      post_id: 'post-5',
      version_number: 1,
      url: 'https://example.com/imgA.jpg',
      curated_image_id: 'img-A',
      selection_source: 'AUTO',
    });

    // 1. Delete image A
    await service.updateMetadata('img-A', { status: 'DELETED' });
    let postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBeNull();

    // 2. Select image B (simulate manual assignment)
    db._postImages.set('pi-5-b', {
      id: 'pi-5-b',
      post_id: 'post-5',
      version_number: 1,
      url: 'https://example.com/imgB.jpg',
      curated_image_id: 'img-B',
      selection_source: 'MANUAL',
    });

    // 3. Query again
    postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBe('https://example.com/imgB.jpg');
    expect(postsRes.results[0].selection_source).toBe('MANUAL');
  });

  it('Scenario H: History preservation for published posts', async () => {
    const db = createMockDb();
    const service = new ImageLibraryService(db);

    db._curatedImages.set('img-hist', { id: 'img-hist', title: 'Historical Asset', status: 'APPROVED' });
    db._posts.set('post-pub', { id: 'post-pub', title: 'Published Post', status: 'published', current_version: 1 });
    db._postImages.set('pi-pub', {
      id: 'pi-pub',
      post_id: 'post-pub',
      version_number: 1,
      url: 'https://example.com/published.jpg',
      curated_image_id: 'img-hist',
      selection_source: 'AUTO',
    });

    // Delete image from library
    await service.updateMetadata('img-hist', { status: 'DELETED' });

    // Published post retains historical post_images record
    expect(db._postImages.has('pi-pub')).toBe(true);

    // Draft query for published post retains historical image_url
    const postsRes = await db.prepare('SELECT p.id, p.idea_id, p.title, p.status FROM posts p').bind('').all();
    expect(postsRes.results[0].image_url).toBe('https://example.com/published.jpg');
  });
});
