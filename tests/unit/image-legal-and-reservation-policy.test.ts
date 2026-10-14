/**
 * NorthSoft.AI.ContentCreator — Regression Tests: Image Legal Policy, Manual Approval & 90-day Exclusions
 */

import { describe, expect, it, vi } from 'vitest';
import { validateImageLicense } from '../../src/services/content/image-license-policy';
import { ImageLibraryService } from '../../src/services/content/image-library-service';

describe('Image License Validation Policy', () => {
  it('allows CC0 and Public Domain without attribution requirement', () => {
    const resCc0 = validateImageLicense('cc0', 'Jane Doe', 'https://example.com/img1');
    expect(resCc0.allowedForCommercialUse).toBe(true);
    expect(resCc0.requiresAttribution).toBe(false);
    expect(resCc0.allowsModifications).toBe(true);

    const resPdm = validateImageLicense('PDM', 'John Smith', 'https://example.com/img2');
    expect(resPdm.allowedForCommercialUse).toBe(true);
    expect(resPdm.requiresAttribution).toBe(false);
  });

  it('allows CC-BY and CC-BY-SA with mandatory attribution snippet', () => {
    const resBy = validateImageLicense('by', 'Alice Walker', 'https://openverse.org/image/123');
    expect(resBy.allowedForCommercialUse).toBe(true);
    expect(resBy.requiresAttribution).toBe(true);
    expect(resBy.attributionText).toContain('Photo by Alice Walker via openverse.org');
    expect(resBy.allowsModifications).toBe(true);

    const resSa = validateImageLicense('cc-by-sa', 'Bob Vance', 'https://flickr.com/photos/123');
    expect(resSa.allowedForCommercialUse).toBe(true);
    expect(resSa.requiresAttribution).toBe(true);
    expect(resSa.normalizedLicense).toBe('CC-BY-SA');
  });

  it('strictly rejects Non-Commercial (NC) licenses for commercial use', () => {
    const resNc = validateImageLicense('by-nc', 'Eve Carter', 'https://example.com');
    expect(resNc.allowedForCommercialUse).toBe(false);
    expect(resNc.rejectionReason).toContain('Non-Commercial');

    const resNcSa = validateImageLicense('cc-by-nc-sa', 'Eve Carter', 'https://example.com');
    expect(resNcSa.allowedForCommercialUse).toBe(false);
  });

  it('allows CC-BY-ND with modification restrictions noted', () => {
    const resNd = validateImageLicense('cc-by-nd', 'Mark Spencer', 'https://example.com');
    expect(resNd.allowedForCommercialUse).toBe(true);
    expect(resNd.requiresAttribution).toBe(true);
    expect(resNd.allowsModifications).toBe(false);
  });

  it('rejects unverified, ambiguous or empty licenses', () => {
    const emptyLic = validateImageLicense('', null, null);
    expect(emptyLic.allowedForCommercialUse).toBe(false);

    const unverified = validateImageLicense('unknown-web-license', null, null);
    expect(unverified.allowedForCommercialUse).toBe(false);
    expect(unverified.rejectionReason).toContain('Unverifiable license terms');
  });

  it('allows NorthSoft internal use license for commercial publication without attribution', () => {
    const res = validateImageLicense('NorthSoft internal use', 'NorthSoft', null);
    expect(res.allowedForCommercialUse).toBe(true);
    expect(res.requiresAttribution).toBe(false);
    expect(res.allowsModifications).toBe(true);
    expect(res.normalizedLicense).toBe('NorthSoft internal use');
  });
});

describe('Image Library Service — Safe Reservations and 90-day Policy', () => {
  it('prevents reserving an image that was used within the last 90 days', async () => {
    const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const mockDb = {
      prepare: vi.fn().mockImplementation((_sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'img-123',
            status: 'APPROVED',
            reserved_post_id: null,
            last_used_at: sixtyDaysAgoIso,
            usage_count: 1,
          }),
        }),
      })),
    } as unknown as D1Database;

    const service = new ImageLibraryService(mockDb);

    await expect(service.reserveImageForDraft('img-123', 'post-abc', true)).rejects.toThrow(
      /used in publication within the last 90 days/,
    );
  });

  it('prevents reserving an image that is already reserved by another post', async () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((_sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'img-123',
            status: 'APPROVED',
            reserved_post_id: 'other-post-999',
            last_used_at: null,
            usage_count: 0,
          }),
        }),
      })),
    } as unknown as D1Database;

    const service = new ImageLibraryService(mockDb);

    await expect(service.reserveImageForDraft('img-123', 'post-abc', true)).rejects.toThrow(
      /already reserved by post other-post-999/,
    );
  });

  it('blocks admin approval if image license is non-commercial (NC)', async () => {
    const mockDb = {
      prepare: vi.fn().mockImplementation((_sql: string) => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'img-nc',
            license: 'BY-NC',
            author: 'Restricted Artist',
            source_url: 'https://example.com/art',
          }),
        }),
      })),
    } as unknown as D1Database;

    const service = new ImageLibraryService(mockDb);

    await expect(service.updateMetadata('img-nc', { status: 'APPROVED' })).rejects.toThrow(
      /Non-Commercial/,
    );
  });
});
