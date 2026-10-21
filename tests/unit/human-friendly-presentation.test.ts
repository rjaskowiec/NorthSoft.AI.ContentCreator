import { describe, it, expect } from 'vitest';
import {
  formatStructuredEvent,
  formatApiToast,
  extractHumanErrorMessage,
  humanizeAiDecision,
  humanizePipelineOutcome,
} from '../../src/admin/ui/event-formatter';
import { formatAuditDetails } from '../../src/admin/ui/audit-formatter';

describe('Human-Friendly Presentation Layer', () => {
  // 1. Known JSON payloads render readable summaries instead of raw JSON by default
  it('renders readable summaries for known generation failure and AI rejection payloads', () => {
    // Representative payload from Section 4 of requirements
    const payload = {
      outcome: 'FAILED',
      ideaId: 'f9917b34-345d-4e2f-b2b8-c96f4e02ffeb',
      title: 'Rethinking the Customer Journey in the Age of AI',
      finalDecision: 'REJECTED',
      rejectionReason: 'Topic does not match current editorial voice guidelines.',
    };

    const formatted = formatStructuredEvent({
      eventType: 'QUALITY_GATE',
      status: 'FAILED',
      details: payload,
    });

    expect(formatted.title).toBe('Post draft rejected by AI review');
    expect(formatted.badgeText).toBe('Rejected');
    expect(formatted.badgeClass).toBe('status-alert');
    expect(formatted.entityName).toBe('Rethinking the Customer Journey in the Age of AI');
    expect(formatted.summary).toContain('Rethinking the Customer Journey in the Age of AI');
    expect(formatted.summary).toContain('Topic does not match current editorial voice guidelines.');

    // Ensure labeled fields are populated
    const labels = formatted.fields.map((f) => f.label);
    expect(labels).toContain('Post');
    expect(labels).toContain('AI decision');
    expect(labels).toContain('Reason');
    expect(labels).toContain('Idea ID');

    // Make sure raw JSON string is NOT the title or summary
    expect(formatted.title).not.toContain('{');
    expect(formatted.summary).not.toContain('{"outcome"');
  });

  // 2. Generation failure and AI rejection are represented accurately and independently
  it('distinguishes generation failure from AI rejection without conflating them', () => {
    // Case A: Technical generation failure (AI review never ran or succeeded)
    const genFailure = formatStructuredEvent({
      eventType: 'POSTS',
      status: 'FAILED',
      details: {
        postId: 'post-123',
        title: 'Cloud Infrastructure Optimization',
        error: 'Workers AI quota exceeded or timeout during LLM completion',
      },
    });

    expect(genFailure.title).toBe('Generation failed');
    expect(genFailure.badgeText).toBe('Failed');
    const genDecField = genFailure.fields.find((f) => f.label === 'AI decision');
    expect(genDecField).toBeUndefined(); // AI decision is not invented!

    // Case B: Generation succeeded, but subsequent AI review rejected the post
    const aiRejection = formatStructuredEvent({
      eventType: 'QUALITY_GATE',
      status: 'FAILED',
      details: {
        postId: 'post-456',
        title: 'Social Engineering in Remote Workspaces',
        finalDecision: 'REJECTED',
        rejectionReason: 'Content tone is excessively alarmist',
      },
    });

    expect(aiRejection.title).toBe('Post draft rejected by AI review');
    expect(aiRejection.badgeText).toBe('Rejected');
    const aiDecField = aiRejection.fields.find((f) => f.label === 'AI decision');
    expect(aiDecField?.value).toBe('Rejected');
    expect(aiRejection.fields.find((f) => f.label === 'Reason')?.value).toBe(
      'Content tone is excessively alarmist',
    );
  });

  // 3. Recorded failure reasons are shown correctly when present
  it('accurately displays recorded failure reasons when present', () => {
    const formatted = formatStructuredEvent({
      eventType: 'POSTS',
      details: {
        title: 'Kubernetes Multi-Cluster Networking',
        finalDecision: 'REJECTED',
        rejectionReason: 'Missing concrete architecture diagram references.',
      },
    });

    const reasonField = formatted.fields.find((f) => f.label === 'Reason');
    expect(reasonField).toBeDefined();
    expect(reasonField?.value).toBe('Missing concrete architecture diagram references.');
  });

  // 4. Missing fields do not produce invented explanations, misleading claims, or rendering errors
  it('does not invent failure reasons when fields are absent', () => {
    const formatted = formatStructuredEvent({
      eventType: 'POSTS',
      status: 'FAILED',
      details: {
        title: 'Microservices with Cloudflare Workers',
        finalDecision: 'REJECTED',
      },
    });

    // Reason field must NOT be present if not in payload
    const reasonField = formatted.fields.find((f) => f.label === 'Reason');
    expect(reasonField).toBeUndefined();
    // Title is still preserved cleanly
    expect(formatted.title).toBe('Post draft rejected by AI review');
    expect(formatted.fields.find((f) => f.label === 'Post')?.value).toBe(
      'Microservices with Cloudflare Workers',
    );
  });

  // 5. Unknown event types have a safe, useful fallback
  it('renders a safe, useful fallback for unknown event types without crashing or showing [object Object]', () => {
    const unknownEvent = formatStructuredEvent({
      eventType: 'CUSTOM_THIRD_PARTY_WEBHOOK',
      status: 'SUCCESS',
      details: {
        batchId: 'batch-999',
        processedItems: 42,
        activeFlag: true,
      },
    });

    expect(unknownEvent.title).toBe('Custom Third Party Webhook');
    expect(unknownEvent.badgeText).toBe('Completed');
    expect(unknownEvent.fields.length).toBeGreaterThanOrEqual(3);
    expect(unknownEvent.summary).not.toContain('[object Object]');
    expect(unknownEvent.summary).not.toContain('{');

    const batchField = unknownEvent.fields.find((f) => f.label === 'Batch Id');
    expect(batchField?.value).toBe('batch-999');
  });

  // 6. Raw details remain accessible and preserve the underlying payload
  it('preserves the complete underlying raw payload without modification or truncation', () => {
    const rawPayload = {
      nestedConfig: { retries: 3, timeout: 5000 },
      internalFlags: ['canary', 'debug'],
      sensitiveRefId: 'ref_987654321',
      title: 'Edge Caching Best Practices',
    };

    const formatted = formatStructuredEvent({
      eventType: 'POSTS',
      details: rawPayload,
    });

    expect(formatted.rawPayload).toEqual(rawPayload);
    expect(formatted.rawPayload.nestedConfig).toEqual({ retries: 3, timeout: 5000 });
    expect(formatted.rawPayload.internalFlags).toEqual(['canary', 'debug']);
  });

  // 7. Nested objects, arrays, long strings, null values, and malformed payloads are handled safely
  it('handles nested objects, null values, and malformed inputs gracefully', () => {
    expect(() => formatStructuredEvent(null)).not.toThrow();
    expect(() => formatStructuredEvent(undefined)).not.toThrow();
    expect(() => formatStructuredEvent({})).not.toThrow();

    const malformedEvent = formatStructuredEvent({
      eventType: undefined,
      status: null as unknown as string,
      details: {
        nullVal: null,
        undefinedVal: undefined,
        nested: { complex: true },
        veryLongStr: 'A'.repeat(5000),
      },
    });

    expect(malformedEvent.title).toBe('System Event');
    expect(malformedEvent.status).toBe('INFO');
    expect(malformedEvent.rawPayload).toBeDefined();
  });

  // 8. HTTP method and endpoint strings are not shown as ordinary user-facing messages for known operations
  it('maps mutating HTTP endpoints to human-friendly toast messages without raw paths or methods', () => {
    const uploadToast = formatApiToast('POST', '/api/admin/images/upload');
    expect(uploadToast.inProgress).toBe('Uploading image…');
    expect(uploadToast.completed).toBe('Image uploaded successfully.');
    expect(uploadToast.inProgress).not.toContain('POST');
    expect(uploadToast.inProgress).not.toContain('/api/');

    const discoveryToast = formatApiToast('POST', '/api/admin/images/candidate-discovery');
    expect(discoveryToast.inProgress).toBe('Searching for suitable images…');
    expect(discoveryToast.completed).toBe('Image discovery completed.');
    expect(discoveryToast.inProgress).not.toContain('/api/');

    const genToast = formatApiToast('POST', '/api/admin/content/generate');
    expect(genToast.inProgress).toBe('Generating post draft…');
    expect(genToast.completed).toBe('Post draft generated successfully.');

    const pubToast = formatApiToast('POST', '/api/admin/facebook/publish');
    expect(pubToast.inProgress).toBe('Publishing post to Facebook…');
    expect(pubToast.completed).toBe('Post published successfully.');

    const schedToast = formatApiToast('POST', '/api/admin/schedules/commit');
    expect(schedToast.inProgress).toBe('Committing publication schedule…');
    expect(schedToast.completed).toBe('Publication schedule committed.');
  });

  // 9. Progress, success, failure, and cancellation messages accurately reflect operation state
  it('formats distinct in-progress, completed, and failure states for toasts', () => {
    const toast = formatApiToast('POST', '/api/admin/facebook/sync');
    expect(toast.title).toBe('Facebook Page Sync');
    expect(toast.inProgress).toBe('Syncing latest posts with Facebook Page…');
    expect(toast.completed).toBe('Facebook Page sync complete.');
    expect(toast.failed).toBe('Facebook sync failed.');
  });

  // 10. Generic and feature-specific handlers do not produce redundant notifications
  it('supports skipToast option to prevent redundant notifications when caller manages task', () => {
    const skipped = formatApiToast('POST', '/api/admin/images/candidate-discovery', {
      skipToast: true,
    });
    expect(skipped.skipToast).toBe(true);
    expect(skipped.title).toBe('');
  });

  // 11. Existing logs and stored records remain intact
  it('formats audit log rows into clean human-friendly summaries without modifying record source', () => {
    const rawAuditDetails = JSON.stringify({
      title: 'Automated Continuous Delivery with Workers',
      finalDecision: 'APPROVED',
      qualityScore: 9,
      postId: 'post-xyz',
    });

    const formatted = formatAuditDetails(rawAuditDetails);
    const titleItem = formatted.find((item) => item.key === 'title');
    expect(titleItem?.label).toBe('Title');
    expect(titleItem?.value).toBe('Automated Continuous Delivery with Workers');

    const decisionItem = formatted.find((item) => item.key === 'finalDecision');
    expect(decisionItem?.label).toBe('AI Decision');
    expect(decisionItem?.value).toBe('APPROVED');

    const scoreItem = formatted.find((item) => item.key === 'qualityScore');
    expect(scoreItem?.label).toBe('Quality Score');
    expect(scoreItem?.value).toBe('9');

    // The original raw JSON string is completely intact and unchanged
    expect(JSON.parse(rawAuditDetails).title).toBe(
      'Automated Continuous Delivery with Workers',
    );
  });

  // 12. Sensitive data is not newly exposed through the presentation layer
  it('extractHumanErrorMessage safely extracts clean text without dumping stack traces or secrets', () => {
    const errorWithStack = new Error('Database query timed out connecting to D1');
    errorWithStack.stack = 'Error: Database query timed out\n    at internalDbCall (/var/secret/db.ts:42)';

    const humanMsg = extractHumanErrorMessage(errorWithStack);
    expect(humanMsg).toBe('Database query timed out connecting to D1');
    expect(humanMsg).not.toContain('/var/secret');

    const jsonError = JSON.stringify({
      error: 'Invalid Facebook page access token format',
      internalCode: 'FB_OAUTH_TOKEN_EXPIRED',
    });
    const parsedHuman = extractHumanErrorMessage(jsonError);
    expect(parsedHuman).toBe('Invalid Facebook page access token format');
    expect(parsedHuman).not.toContain('FB_OAUTH_TOKEN_EXPIRED');
  });

  // 13. Decision and outcome enum humanizers produce friendly labels
  it('humanizes AI decision and pipeline outcome enums into accessible badge texts', () => {
    expect(humanizeAiDecision('PASS').label).toBe('Approved');
    expect(humanizeAiDecision('PASSED').label).toBe('Approved');
    expect(humanizeAiDecision('APPROVED').label).toBe('Approved');
    expect(humanizeAiDecision('REJECTED').label).toBe('Rejected');
    expect(humanizeAiDecision('BLOCKED').label).toBe('Blocked');
    expect(humanizeAiDecision(null).label).toBe('Not evaluated');

    expect(humanizePipelineOutcome('COMPLETED_WITH_OUTPUT').label).toBe('Completed with output');
    expect(humanizePipelineOutcome('NO_WORK_NEEDED').label).toBe('No work needed');
    expect(humanizePipelineOutcome('BLOCKED').label).toBe('Blocked');
    expect(humanizePipelineOutcome('FAILED').label).toBe('Failed');
  });
});
