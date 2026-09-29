import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenverseImageService } from '../../src/services/content/image-service';

describe('OpenverseImageService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the current Cloudflare LLaVA model with its prompt/image input shape', async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        decision: 'accept', confidence: 0.91, matches_content: true,
        mismatches: [], reason: 'The image shows a team meeting.',
      }),
    });
    const service = new OpenverseImageService({ AI: { run } } as unknown as Env);

    const result = await service.verifyImageWithVision(new Uint8Array([1, 2, 3]).buffer, 'Team meeting', 'A team discusses a project.');

    expect(run).toHaveBeenCalledWith('@cf/llava-hf/llava-1.5-7b-hf', expect.objectContaining({
      prompt: expect.stringContaining('Team meeting'),
      image: [1, 2, 3],
    }));
    expect(result.matches_content).toBe(true);
  });

  it('rejects an accept response when the model says the image does not match', async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({ decision: 'accept', confidence: 0.99, matches_content: false, mismatches: ['unrelated'], reason: 'Mismatch' }),
    });
    const service = new OpenverseImageService({ AI: { run } } as unknown as Env);

    const result = await service.verifyImageWithVision(new Uint8Array([1]).buffer, 'Topic', 'Post');

    expect(result.decision).toBe('reject');
    expect(result.confidence).toBe(0);
  });

  it('returns CC0/PDM candidates with their attribution and license provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: 'img-1', url: 'https://images.example/photo.jpg', title: 'Team meeting', creator: 'Author', creator_url: 'https://author.example', license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', foreign_landing_url: 'https://source.example/photo' },
      { id: 'img-2', url: 'https://images.example/photo2.jpg', title: 'Licensed image', license: 'by', license_url: 'https://creativecommons.org/licenses/by/4.0/' },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new OpenverseImageService({} as Env);

    const candidates = await service.searchImages('team meeting', 5);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: 'img-1', license: 'CC0', author: 'Author', sourceUrl: 'https://source.example/photo' });
  });
});
