# ADR-001: Cloudflare Free as Infrastructure Constraint

**Status**: Accepted  
**Date**: 2026-09-25  
**Author**: rjaskowiec

## Context

NorthSoft.AI.ContentCreator needs a hosting platform for an autonomous content pipeline. The system must be cost-conscious while supporting scheduled tasks, database storage, and API integrations.

## Decision

Use **Cloudflare Free plan** as the primary infrastructure constraint. All Cloudflare services used must be available on the Free plan unless explicitly approved otherwise.

### Services Used
- **Cloudflare Workers** (100K requests/day, 10ms CPU/request)
- **Cloudflare D1** (5GB storage, 5M reads/day, 100K writes/day)
- **Cloudflare Cron Triggers** (for scheduled pipeline runs)
- **Cloudflare Worker Secrets** (encrypted credential storage)

### Services Avoided
- Cloudflare KV (not needed initially; D1 suffices)
- Cloudflare Pages (Worker handles all routing)
- Cloudflare R2 (no blob storage needed for MVP)
- Any paid Cloudflare add-ons

## Consequences

### Positive
- Zero infrastructure cost for the platform itself
- Global edge distribution built-in
- No server management
- Built-in DDoS protection and SSL

### Constraints
- 10ms CPU time per request (mitigated: AI API calls are I/O, not CPU)
- 100K requests/day (sufficient for autonomous pipeline + admin usage)
- D1 is SQLite-based (no stored procedures, limited concurrent writes)
- Worker script size limits (bundled)

### Risks
- If the project scales beyond Free plan limits, migration to Paid ($5/month) is straightforward — same APIs, higher limits
- D1 concurrent write limitations may require batching strategies for high-volume operations

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| VPS (Hetzner, DigitalOcean) | Ongoing cost, server management, not edge-distributed |
| AWS Lambda + DynamoDB | Vendor lock-in, complex pricing, cold starts |
| Vercel | Serverless functions have shorter limits, database requires separate service |
| Deno Deploy | Less mature D1 equivalent, smaller ecosystem |
