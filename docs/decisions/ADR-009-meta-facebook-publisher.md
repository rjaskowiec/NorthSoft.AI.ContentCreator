# ADR-009: Official Meta Graph API Facebook Publisher Adapter

- **Status**: Approved
- **Date**: 2026-09-25
- **Deciders**: Architecture Team, Security Team

## Context

Phase 4 requires adding publication capabilities to push internal, Quality Gate-approved content to the official NorthSoft Facebook Page.

The solution must operate safely without exposing access tokens, risking duplicate postings, or consuming Workers AI neuron budget.

## Decision

1. **Official Meta Graph API Only**:
   - Use official Meta Graph API endpoints (`POST https://graph.facebook.com/v19.0/{page_id}/feed`).
   - Strictly prohibit browser automation, Selenium, Playwright, or Facebook scraping.

2. **Thin Publishing Adapter Architecture**:
   - `FacebookPublisher` implements `IMetaPublisher` as a thin transport boundary.
   - Zero AI calls and zero Quality Gate logic inside `FacebookPublisher` or `PublicationService`.
   - Publishing consumes zero Neurons from the daily 7,500 daily quota.

3. **Server-Side Quality Gate Invariant**:
   - Content MUST have `post_version.status = 'approved'` in D1 before publication is attempted.
   - Unapproved, rejected, or blocked content attempts return HTTP 403 `POST_NOT_APPROVED` without contacting Meta.

4. **Idempotency & Concurrency Locking**:
   - D1-backed state transitions (`scheduled` -> `publishing` -> `published`) with unique idempotency keys (`pub_{post_id}_{post_version_id}`) guarantee duplicate prevention even under network timeouts or concurrent Worker executions.

5. **Secrets & Environment Degradation**:
   - Credentials come from Cloudflare environment bindings (`META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`, `FACEBOOK_PUBLISH_ENABLED`).
   - If credentials are absent or publishing is disabled, the app safely defaults to `META_NOT_CONFIGURED` without crashing.

6. **Sanitization**:
   - All Meta API errors are sanitized via `sanitizeSecretTokens` before logging or returning to the UI to ensure access tokens are never exposed.

## Consequences

- Direct, reliable Facebook Page publication using Meta's official API contract.
- Complete isolation between AI content generation and publishing transport.
- Safe local and staging operation without accidental Facebook posts.
