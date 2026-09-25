# ADR-004: Official Meta API Only

**Status**: Accepted  
**Date**: 2026-09-25  
**Author**: rjaskowiec

## Context

The application needs to publish content to the NorthSoft Facebook Page. Facebook provides official Graph API endpoints for page management and post publishing.

## Decision

Use **only official Meta/Facebook Graph API** for all Facebook interactions. The integration is isolated behind an `IMetaPublisher` abstraction to enable independent updates when Meta changes their API.

### Prohibited Approaches
- Browser automation (Selenium, Puppeteer, Playwright)
- Web scraping of Facebook
- Simulated user interactions
- Unofficial APIs or reverse-engineered endpoints
- Third-party tools that bypass Meta's official interfaces

### API Requirements
- Page Access Token with `pages_manage_posts` permission
- Long-lived tokens with automatic refresh strategy
- Official Graph API endpoints for post creation and scheduling

### Abstraction
The `IMetaPublisher` interface isolates all Meta interactions:
- `publish(request)` — Create/schedule a post
- `validateToken()` — Verify token validity and permissions
- `healthCheck()` — Verify API reachability

This allows updating the Meta integration independently when Graph API versions change.

## Consequences

### Positive
- Compliant with Meta Platform Terms of Service
- Stable, documented API with predictable behavior
- No risk of account suspension for ToS violations
- Clean abstraction enables API version upgrades

### Constraints
- Requires Meta App Review for some permissions
- Token management complexity (long-lived tokens, refresh)
- Rate limits apply (200 calls/user/hour typical)
- API can change with new Graph API versions

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| Browser automation | Violates Meta ToS, brittle, account suspension risk |
| Third-party posting services | Additional dependency, cost, and trust boundary |
| Multiple social platforms initially | Scope creep; Facebook first, then extend |
